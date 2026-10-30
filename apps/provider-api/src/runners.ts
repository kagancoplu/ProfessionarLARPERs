/**
 * Runners: what a product's jobs are and how they are simulated. A product
 * names its runner in its JSON file (`"runner": "proxy"`); everything else in
 * the provider API (402 pricing, credits, redeem, catalog) is shared.
 *
 *   gpu    GPU jobs (finetune / eval / inference), measured in minutes
 *   proxy  residential-proxy bandwidth (crawl / scrape), measured in MB
 *
 * The logs are fake but deterministic: a PRNG seeded by the job id, so the log
 * and the result hash are reproducible from the job record alone.
 */
import { createHash } from 'node:crypto'
import type { Product, RunnerId } from './products'

export interface ScriptLine { at: number, line: string }

export interface RunnerSpec {
  id: RunnerId
  kinds: readonly string[]
  /** The job request field that holds the quantity. */
  quantityField: 'minutes' | 'mb'
  /** Largest quantity one request may buy. */
  maxQuantity: number
  /** Name of the slot (GPU, proxy exit…) a job runs on. */
  slotName: (slot: number) => string
  /** The fake log of a job, with the fraction of the run (0..1) at which each line appears. */
  script: (job: { id: string, kind: string, units: number }, product: Pick<Product, 'label'>, slot: number) => ScriptLine[]
}

/** mulberry32: a small deterministic PRNG. */
export function prng (seedHex: string): () => number {
  let a = Number.parseInt(seedHex.slice(0, 8), 16) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const seeded = (jobId: string): (() => number) => prng(createHash('sha256').update(jobId).digest('hex'))
const fmt = (n: number): string => Math.round(n).toLocaleString('en-US')

export const gpuName = (gpu: number): string => `h100-${gpu}`

/** GPU jobs: training loss, eval accuracy or serving latency, by kind. */
export function gpuScript (job: { id: string, kind: string, units: number }, product: Pick<Product, 'label'>, gpu: number): ScriptLine[] {
  const rand = seeded(job.id)
  const minutes = job.units
  const g = `[${gpuName(gpu)}]`
  const n = Math.min(12, Math.max(3, Math.ceil(minutes / 10)))
  const lines: ScriptLine[] = [{ at: 0, line: `${g} ${job.kind} · ${minutes} min on ${product.label} · CUDA 12.4 · 80 GB HBM3` }]
  const tokPerSec = (base: number): string => fmt(base * (0.9 + 0.2 * rand()))
  for (let i = 1; i <= n; i++) {
    const p = i / n
    let line: string
    if (job.kind === 'finetune') {
      const steps = minutes * 10
      const loss = 2.4 * Math.exp(-1.1 * p) + 0.05 * rand()
      line = `step ${Math.round(steps * p)}/${steps} loss=${loss.toFixed(3)} lr=2.0e-5 tok/s=${tokPerSec(48_000)}`
    } else if (job.kind === 'eval') {
      const batches = minutes * 4
      const acc = 0.62 + 0.2 * p + 0.03 * rand()
      line = `batch ${Math.round(batches * p)}/${batches} acc=${acc.toFixed(3)} f1=${(acc - 0.04).toFixed(3)} tok/s=${tokPerSec(92_000)}`
    } else {
      line = `served ${Math.round(minutes * 120 * p)} req p50=${Math.round(38 + 8 * rand())}ms p99=${Math.round(140 + 60 * rand())}ms tok/s=${tokPerSec(150_000)}`
    }
    lines.push({ at: p * 0.98, line: `${g} t+${Math.round((minutes * i) / n)}m ${line}` })
  }
  return lines
}

export const proxyName = (slot: number): string => `exit-${slot}`
const COUNTRIES = ['US', 'DE', 'GB', 'FR', 'JP', 'BR', 'IN', 'CA', 'NL', 'TR', 'KR', 'AU']

/** Proxy jobs: bandwidth used, requests, success rate and exit countries. */
export function proxyScript (job: { id: string, kind: string, units: number }, product: Pick<Product, 'label'>, slot: number): ScriptLine[] {
  const rand = seeded(job.id)
  const mb = job.units
  const x = `[${proxyName(slot)}]`
  const n = Math.min(10, Math.max(3, Math.ceil(mb / 256)))
  const perRequestKb = job.kind === 'scrape' ? 180 : 420 // scraping fetches lighter pages
  const lines: ScriptLine[] = [{ at: 0, line: `${x} ${job.kind} · ${fmt(mb)} MB on ${product.label} · rotating residential IPs` }]
  for (let i = 1; i <= n; i++) {
    const p = i / n
    const used = mb * p
    const requests = (used * 1024) / perRequestKb
    const ok = 96 + 3.5 * rand()
    const countries = COUNTRIES.slice(0, 3 + Math.floor(rand() * 9))
    lines.push({ at: p * 0.98, line: `${x} ${fmt(used)}/${fmt(mb)} MB · ${fmt(requests)} req · ${ok.toFixed(1)}% ok · ${countries.length} countries (${countries.slice(0, 3).join(', ')}…)` })
  }
  return lines
}

export const RUNNERS: Record<RunnerId, RunnerSpec> = {
  gpu: { id: 'gpu', kinds: ['finetune', 'eval', 'inference'], quantityField: 'minutes', maxQuantity: 7 * 24 * 60, slotName: gpuName, script: gpuScript },
  proxy: { id: 'proxy', kinds: ['crawl', 'scrape'], quantityField: 'mb', maxQuantity: 1024 * 1024, slotName: proxyName, script: proxyScript }
}
