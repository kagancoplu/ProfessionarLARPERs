import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LiveTick } from '@agentcoop/relay/contract'
import { createBus } from '../src/events/bus'
import type { LiveSnapshot } from '../src/events/adapters/supabaseApply'
import { startSupabaseLive, type LiveClient } from '../src/events/adapters/supabaseLive'
import { makeEvent, type CoopEvent } from '../src/events/types'
import { makeMockPool } from '../src/mock/data'
import { createAppStore } from '../src/store'
import { DEFAULT_SETTINGS } from '../src/store/types'

const T = '2026-10-31T12:00:00.000Z'
const empty: LiveSnapshot = { pools: [], pledges: {}, listings: [], vaults: [], vaultCredits: {}, agents: [], health: [] }

function fakeClient (snapshot: () => Promise<LiveSnapshot>, history: CoopEvent[] = []) {
  let onTick: ((t: LiveTick) => void) | undefined
  const historyLimits: number[] = []
  const client: LiveClient = {
    snapshot,
    history: async limit => { historyLimits.push(limit); return history },
    subscribeTicks: cb => { onTick = cb; return () => { onTick = undefined } }
  }
  return { client, tick: (t: LiveTick) => onTick?.(t), historyLimits }
}

function setup () {
  const store = createAppStore('live', undefined, { ...DEFAULT_SETTINGS })
  const bus = createBus(store)
  const seen: string[] = []
  bus.subscribe(e => seen.push(e.type))
  return { store, bus, seen }
}

describe('startSupabaseLive', () => {
  afterEach(() => { vi.useRealTimers() })

  it('buffers ticks until the snapshot is applied, then applies them in order', async () => {
    const { store, bus } = setup()
    const a = makeMockPool(1, 10)
    const b = makeMockPool(2, 10)
    let release: ((s: LiveSnapshot) => void) | undefined
    const f = fakeClient(async () => await new Promise<LiveSnapshot>(resolve => { release = resolve }))
    const live = startSupabaseLive({ client: f.client, bus, store, onStale: () => {} })
    f.tick({ v: 1, ts: T, pools: [b] } as unknown as LiveTick)
    for (let i = 0; i < 20 && release === undefined; i++) await Promise.resolve() // history first, then snapshot()
    expect(store.getState().pools.order).toEqual([])
    release?.({ ...empty, pools: [a] })
    await live.ready
    expect(store.getState().pools.order).toEqual([a.poolId, b.poolId])
    live.close()
  })

  it('a failing snapshot rejects ready', async () => {
    const { store, bus } = setup()
    const f = fakeClient(async () => { throw new Error('relation "live_pools" does not exist') })
    const live = startSupabaseLive({ client: f.client, bus, store, onStale: () => {} })
    await expect(live.ready).rejects.toThrow('live_pools')
    live.close()
  })

  it('a snapshot slower than snapshotTimeoutMs rejects ready', async () => {
    vi.useFakeTimers()
    const { store, bus } = setup()
    const f = fakeClient(async () => await new Promise<LiveSnapshot>(() => {}))
    const live = startSupabaseLive({ client: f.client, bus, store, onStale: () => {}, snapshotTimeoutMs: 5_000 })
    const settled = live.ready.then(() => 'ok', (err: Error) => err.message)
    await vi.advanceTimersByTimeAsync(5_001)
    expect(await settled).toMatch(/timed out/)
    live.close()
  })

  it('calls onStale once after staleMs without ticks; a heartbeat resets the timer', async () => {
    vi.useFakeTimers()
    const { store, bus } = setup()
    const f = fakeClient(async () => empty)
    let stale = 0
    const live = startSupabaseLive({ client: f.client, bus, store, onStale: () => { stale++ }, staleMs: 45_000 })
    await vi.advanceTimersByTimeAsync(40_000)
    f.tick({ v: 1, ts: T, heartbeat: true })
    await vi.advanceTimersByTimeAsync(40_000)
    expect(stale).toBe(0)
    await vi.advanceTimersByTimeAsync(100_000)
    expect(stale).toBe(1)
    live.close()
  })

  it('hydrates the last 200 events from history before the snapshot, without bus listeners', async () => {
    const { store, bus, seen } = setup()
    const earlier = makeEvent('agents', 'agent_thought', { text: 'earlier' }, { id: 'agents:1', ts: T })
    const f = fakeClient(async () => empty, [earlier])
    const live = startSupabaseLive({ client: f.client, bus, store, onStale: () => {} })
    await live.ready
    expect(f.historyLimits).toEqual([200])
    expect(store.getState().feed.map(e => e.id)).toEqual(['agents:1'])
    expect(seen).toEqual([])
    live.close()
  })
})
