/** Track C Faz 0: products are configuration; the job simulator is deterministic and queues per GPU. */
import { describe, expect, it } from 'vitest'
import { loadProducts, parseProduct, retailSatsFor, type Product } from '../apps/provider-api/src/products'
import { JobRunner, simulateLog } from '../apps/provider-api/src/runner'

const product = (gpus: number): Product => ({
  id: 'gpu-h100', label: 'H100 GPU-hour', unit: 'GPU-hour', retailSatsPerCredit: 50, minutesPerCredit: 60, tokenId: null,
  simulate: { minutesPerSecond: 1200, gpus }
})
const job = { owner: '02'.padEnd(66, '1'), product: 'gpu-h100', payment: { method: 'sats' as const, satoshis: 1, txid: 'x' } }

describe('products', () => {
  it('loads products/gpu-h100.json', () => {
    const [p] = loadProducts()
    expect(p).toMatchObject({ id: 'gpu-h100', unit: 'GPU-hour', retailSatsPerCredit: 50, minutesPerCredit: 60, simulate: { minutesPerSecond: 60 } })
  })

  it('bills retail per minute at the per-credit price, rounding up to whole sats', () => {
    const p = product(1)
    expect([1, 4, 30, 60, 90, 480].map(m => retailSatsFor(p, m))).toEqual([1, 4, 25, 50, 75, 400])
    expect(retailSatsFor({ retailSatsPerCredit: 50 }, 30)).toBe(1500) // minutesPerCredit defaults to 1
  })

  it('rejects an invalid product file', () => {
    expect(() => parseProduct({ ...product(1), retailSatsPerCredit: 0 })).toThrow(/retailSatsPerCredit/)
    expect(() => parseProduct({ ...product(1), tokenId: 'abc.0' })).toThrow(/tokenId/)
    expect(() => parseProduct({ ...product(1), minutesPerCredit: 0 })).toThrow(/minutesPerCredit/)
  })
})

describe('job runner', () => {
  it('generates the same GPU log for the same job', () => {
    const a = simulateLog({ id: 'job1', kind: 'finetune', minutes: 60 }, product(1), 0)
    const b = simulateLog({ id: 'job1', kind: 'finetune', minutes: 60 }, product(1), 0)
    const c = simulateLog({ id: 'job2', kind: 'finetune', minutes: 60 }, product(1), 0)
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
    expect(a.at(-1)!.line).toMatch(/step 600\/600 loss=0\.\d{3}/)
  })

  it('runs at most `gpus` jobs at once and queues the rest', async () => {
    const runner = new JobRunner({ products: [product(1)] })
    const first = runner.submit({ ...job, kind: 'eval', minutes: 20 })
    const second = runner.submit({ ...job, kind: 'inference', minutes: 20 })
    expect(runner.get(first.id)!.status).toBe('running')
    expect(runner.get(second.id)!.status).toBe('queued')
    await runner.wait(first.id)
    expect(runner.get(second.id)!.status).toBe('running')
    const done = await runner.wait(second.id)
    expect(done.status).toBe('done')
    expect(new Date(done.startedAt!).getTime()).toBeGreaterThanOrEqual(new Date(runner.get(first.id)!.finishedAt!).getTime())
    runner.stop()
  })
})
