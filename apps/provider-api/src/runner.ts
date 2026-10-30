/**
 * Simulated GPU job runner. The payment, credits and settlement around a job
 * are real; the GPU work is not.
 *
 * A job takes `minutes / product.simulate.minutesPerSecond` real seconds. While
 * it runs it prints fake "GPU log" lines (step, loss, throughput…), generated
 * from a PRNG seeded by the job id, so the log and the result hash are
 * reproducible from the job record alone. At most `simulate.gpus` jobs run per
 * product at once; the rest queue. Jobs are kept in memory and in a JSON file.
 */
import { createHash, randomBytes } from 'node:crypto'
import { JsonFile } from './jsonFile'
import type { Product } from './products'

export const JOB_KINDS = ['finetune', 'eval', 'inference'] as const
export type JobKind = typeof JOB_KINDS[number]

/** Longest job one request may buy (one week of one GPU). */
export const MAX_JOB_MINUTES = 7 * 24 * 60

export type JobPayment =
  /** Paid from the prepaid credit balance, metered in GPU minutes. */
  | { method: 'credits', minutes: number, tokenId: string }
  | { method: 'sats', satoshis: number, txid: string }

export interface Job {
  id: string
  owner: string
  product: string
  kind: JobKind
  minutes: number
  status: 'queued' | 'running' | 'done'
  payment: JobPayment
  createdAt: string
  startedAt?: string
  finishedAt?: string
  gpu?: number
  log: string[]
  resultHash?: string
}

export interface NewJob {
  owner: string
  product: string
  kind: JobKind
  minutes: number
  payment: JobPayment
}

export interface JobRunnerOptions {
  products: Product[]
  /** JSON file for jobs (e.g. data/provider/jobs.json). Omit to keep them in memory only. */
  file?: string
}

const DEFAULT_GPUS = 8

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
    if (!this.products.has(req.product)) throw new Error(`unknown product ${req.product}`)
    const job: Job = {
      id: randomBytes(8).toString('hex'),
      ...req,
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
    const gpus = product.simulate.gpus ?? DEFAULT_GPUS
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
    const durationMs = (job.minutes / product.simulate.minutesPerSecond) * 1000
    const script = simulateLog(job, product, gpu)
    for (const { at, line } of script) {
      this.schedule(at * durationMs, () => { job.log.push(line) })
    }
    this.schedule(durationMs, () => {
      job.resultHash = resultHash(job.id, job.log)
      job.log.push(`[${gpuName(gpu)}] done · result sha256=${job.resultHash}`)
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

export const gpuName = (gpu: number): string => `h100-${gpu}`

export function resultHash (jobId: string, log: string[]): string {
  return createHash('sha256').update(`${jobId}\n${log.join('\n')}`).digest('hex')
}

/** mulberry32: a small deterministic PRNG. */
function prng (seedHex: string): () => number {
  let a = Number.parseInt(seedHex.slice(0, 8), 16) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The fake GPU log of a job: lines with the fraction of the run (0..1) at
 * which each appears. Deterministic in (job id, kind, minutes, gpu).
 */
export function simulateLog (job: Pick<Job, 'id' | 'kind' | 'minutes'>, product: Pick<Product, 'label'>, gpu: number): Array<{ at: number, line: string }> {
  const rand = prng(createHash('sha256').update(job.id).digest('hex'))
  const g = `[${gpuName(gpu)}]`
  const n = Math.min(12, Math.max(3, Math.ceil(job.minutes / 10)))
  const lines: Array<{ at: number, line: string }> = [
    { at: 0, line: `${g} ${job.kind} · ${job.minutes} min on ${product.label} · CUDA 12.4 · 80 GB HBM3` }
  ]
  const tokPerSec = (base: number): string => Math.round(base * (0.9 + 0.2 * rand())).toLocaleString('en-US')
  const tAt = (i: number): string => `t+${Math.round((job.minutes * i) / n)}m`
  for (let i = 1; i <= n; i++) {
    const p = i / n
    let line: string
    if (job.kind === 'finetune') {
      const steps = job.minutes * 10
      const loss = 2.4 * Math.exp(-1.1 * p) + 0.05 * rand()
      line = `step ${Math.round(steps * p)}/${steps} loss=${loss.toFixed(3)} lr=2.0e-5 tok/s=${tokPerSec(48_000)}`
    } else if (job.kind === 'eval') {
      const batches = job.minutes * 4
      const acc = 0.62 + 0.2 * p + 0.03 * rand()
      line = `batch ${Math.round(batches * p)}/${batches} acc=${acc.toFixed(3)} f1=${(acc - 0.04).toFixed(3)} tok/s=${tokPerSec(92_000)}`
    } else {
      const served = Math.round(job.minutes * 120 * p)
      line = `served ${served} req p50=${Math.round(38 + 8 * rand())}ms p99=${Math.round(140 + 60 * rand())}ms tok/s=${tokPerSec(150_000)}`
    }
    lines.push({ at: p * 0.98, line: `${g} ${tAt(i)} ${line}` })
  }
  return lines
}
