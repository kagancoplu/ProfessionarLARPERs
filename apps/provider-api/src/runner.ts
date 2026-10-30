/**
 * Simulated job runner. The payment, credits and settlement around a job are
 * real; the work (GPU time, proxy bandwidth) is not.
 *
 * A job of `units` (minutes, MB…) takes `units / unitsPerSecond` real seconds.
 * While it runs it prints the fake log of its product's runner (runners.ts),
 * so the log and the result hash are reproducible from the job record alone.
 * At most `slots` jobs run per product at once; the rest queue. Jobs are kept
 * in memory and in a JSON file.
 */
import { createHash, randomBytes } from 'node:crypto'
import { JsonFile } from './jsonFile'
import { runnerIdOf, slotsOf, unitsPerSecond, type Product } from './products'
import { gpuScript, RUNNERS } from './runners'

export { gpuName } from './runners'

/** GPU job kinds (the gpu runner's). */
export const JOB_KINDS = RUNNERS.gpu.kinds as readonly ['finetune', 'eval', 'inference']
/** Any product's job kind (runners.ts lists them per runner). */
export type JobKind = string

/** Longest GPU job one request may buy (one week of one GPU). */
export const MAX_JOB_MINUTES = RUNNERS.gpu.maxQuantity

export type JobPayment =
  /** Paid from the prepaid credit balance, in metered units (`minutes` repeats them for GPU products). */
  | { method: 'credits', units: number, minutes?: number, tokenId: string }
  | { method: 'sats', satoshis: number, txid: string }

export interface Job {
  id: string
  owner: string
  product: string
  kind: JobKind
  /** Quantity in the runner's unit (GPU minutes, proxy MB). */
  units: number
  /** The runner's quantity unit, e.g. "minutes" or "mb". */
  unit: string
  /** GPU products: the same as units. */
  minutes?: number
  status: 'queued' | 'running' | 'done'
  payment: JobPayment
  createdAt: string
  startedAt?: string
  finishedAt?: string
  /** Slot the job ran on (GPU index, proxy exit). */
  gpu?: number
  log: string[]
  resultHash?: string
}

export interface NewJob {
  owner: string
  product: string
  kind: JobKind
  units: number
  payment: JobPayment
}

export interface JobRunnerOptions {
  products: Product[]
  /** JSON file for jobs (e.g. data/provider/jobs.json). Omit to keep them in memory only. */
  file?: string
}

export class JobRunner {
  private readonly products: Map<string, Product>
  private readonly store: JsonFile<Job[]>
  private readonly jobs = new Map<string, Job>()
  private readonly queues = new Map<string, string[]>()
  private readonly busyGpus = new Map<string, Set<number>>()
  private readonly waiters = new Map<string, Array<(job: Job) => void>>()
  private readonly timers = new Set<NodeJS.Timeout>()
  private stopped = false

  constructor (opts: JobRunnerOptions) {
    this.products = new Map(opts.products.map(p => [p.id, p]))
    this.store = new JsonFile<Job[]>(opts.file, () => [])
    // Jobs interrupted by a restart run again from the start.
    for (const job of this.store.read()) {
      if (job.status !== 'done') Object.assign(job, { status: 'queued', log: [], startedAt: undefined, gpu: undefined })
      this.jobs.set(job.id, job)
      if (job.status === 'queued') this.queue(job.product).push(job.id)
    }
    for (const id of this.products.keys()) this.pump(id)
  }

  submit (req: NewJob): Job {
    if (this.stopped) throw new Error('runner stopped')
    const product = this.products.get(req.product)
    if (product === undefined) throw new Error(`unknown product ${req.product}`)
    const spec = RUNNERS[runnerIdOf(product)]
    const job: Job = {
      id: randomBytes(8).toString('hex'),
      ...req,
      unit: spec.quantityField,
      ...(spec.id === 'gpu' ? { minutes: req.units } : {}),
      status: 'queued',
      createdAt: new Date().toISOString(),
      log: []
    }
    this.jobs.set(job.id, job)
    this.queue(job.product).push(job.id)
    this.save()
    this.pump(job.product)
    return job
  }

  get (id: string): Job | undefined {
    return this.jobs.get(id)
  }

  list (owner?: string): Job[] {
    return [...this.jobs.values()].filter(j => owner === undefined || j.owner === owner)
  }

  /** Resolves when the job is done. */
  async wait (id: string): Promise<Job> {
    const job = this.jobs.get(id)
    if (job === undefined) throw new Error(`unknown job ${id}`)
    if (job.status === 'done') return job
    return await new Promise(resolve => { this.waiters.set(id, [...(this.waiters.get(id) ?? []), resolve]) })
  }

  stop (): void {
    this.stopped = true
    for (const t of this.timers) clearTimeout(t)
    this.timers.clear()
  }

  private queue (product: string): string[] {
    let q = this.queues.get(product)
    if (q === undefined) { q = []; this.queues.set(product, q) }
    return q
  }

  private pump (productId: string): void {
    const product = this.products.get(productId)
    if (product === undefined || this.stopped) return
    const gpus = slotsOf(product)
    const busy = this.busyGpus.get(productId) ?? new Set<number>()
    this.busyGpus.set(productId, busy)
    const q = this.queue(productId)
    while (q.length > 0 && busy.size < gpus) {
      const job = this.jobs.get(q.shift()!)!
      let gpu = 0
      while (busy.has(gpu)) gpu++
      busy.add(gpu)
      this.start(job, product, gpu)
    }
  }

  private start (job: Job, product: Product, gpu: number): void {
    job.status = 'running'
    job.startedAt = new Date().toISOString()
    job.gpu = gpu
    this.save()
    const spec = RUNNERS[runnerIdOf(product)]
    const durationMs = (job.units / unitsPerSecond(product)) * 1000
    const script = spec.script(job, product, gpu)
    for (const { at, line } of script) {
      this.schedule(at * durationMs, () => { job.log.push(line) })
    }
    this.schedule(durationMs, () => {
      job.resultHash = resultHash(job.id, job.log)
      job.log.push(`[${spec.slotName(gpu)}] done · result sha256=${job.resultHash}`)
      job.status = 'done'
      job.finishedAt = new Date().toISOString()
      this.busyGpus.get(job.product)?.delete(gpu)
      this.save()
      for (const resolve of this.waiters.get(job.id) ?? []) resolve(job)
      this.waiters.delete(job.id)
      this.pump(job.product)
    })
  }

  private schedule (ms: number, fn: () => void): void {
    const t = setTimeout(() => { this.timers.delete(t); fn() }, Math.max(0, Math.round(ms)))
    this.timers.add(t)
  }

  private save (): void {
    this.store.write([...this.jobs.values()])
  }
}

export function resultHash (jobId: string, log: string[]): string {
  return createHash('sha256').update(`${jobId}\n${log.join('\n')}`).digest('hex')
}

/** GPU job log (kept for callers of the first version; runners.ts has every runner's). */
export function simulateLog (job: Pick<Job, 'id' | 'kind'> & { minutes: number }, product: Pick<Product, 'label'>, gpu: number): Array<{ at: number, line: string }> {
  return gpuScript({ id: job.id, kind: job.kind, units: job.minutes }, product, gpu)
}

