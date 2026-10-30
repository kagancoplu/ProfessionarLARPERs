import { describe, expect, it, vi } from 'vitest'
import { FxQueue } from '../src/town/fx/queue'

describe('FxQueue', () => {
  it('runs exclusive jobs in order, one at a time; parallel jobs run at once', async () => {
    vi.useFakeTimers()
    const q = new FxQueue({ speed: 2 })
    const order: string[] = []
    q.enqueue('a', async ctx => { order.push('a:start'); await ctx.wait(1000); order.push('a:end') })
    q.enqueue('b', async () => { order.push('b') })
    void q.parallel('p', async () => { order.push('p') })
    expect(order).toEqual(['a:start', 'p'])
    expect(q.pending).toBe(2)
    await vi.advanceTimersByTimeAsync(499) // 1000 ms at 2× = 500 ms
    expect(order).toEqual(['a:start', 'p'])
    await vi.advanceTimersByTimeAsync(2)
    expect(order).toEqual(['a:start', 'p', 'a:end', 'b'])
    expect(q.pending).toBe(0)
    vi.useRealTimers()
  })
  it('clear() drops waiting jobs and flags the running one as cancelled; reduced motion skips waits', async () => {
    vi.useFakeTimers()
    const q = new FxQueue({ reducedMotion: true })
    const seen: string[] = []
    let cancelledSeen = false
    q.enqueue('long', async ctx => { await ctx.wait(5000); cancelledSeen = ctx.cancelled(); seen.push('long') })
    q.enqueue('never', async () => { seen.push('never') })
    q.clear()
    await vi.advanceTimersByTimeAsync(1)
    expect(seen).toEqual(['long'])
    expect(cancelledSeen).toBe(true)
    vi.useRealTimers()
  })
})
