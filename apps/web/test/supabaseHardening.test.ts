/** BL-34: the Supabase review's deferred items on the web side (plan/HANDOFF.md §4.4). */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LiveTick } from '@agentcoop/relay/contract'
import { createBus } from '../src/events/bus'
import { sanitizeTick, type LiveSnapshot } from '../src/events/adapters/supabaseApply'
import { startSupabaseLive, type LiveClient } from '../src/events/adapters/supabaseLive'
import { makeMockPool } from '../src/mock/data'
import { createAppStore } from '../src/store'
import { DEFAULT_SETTINGS } from '../src/store/types'
import { claimTabId } from '../src/town/multiplayer'

const T = '2026-10-31T12:00:00.000Z'
const empty: LiveSnapshot = { pools: [], pledges: {}, listings: [], vaults: [], vaultCredits: {}, agents: [], health: [] }

function client () {
  let onTick: ((t: LiveTick) => void) | undefined
  let onStatus: ((ok: boolean, detail?: string) => void) | undefined
  let subscriptions = 0
  let snapshots = 0
  const c: LiveClient = {
    snapshot: async () => { snapshots++; return empty },
    history: async () => [],
    subscribeTicks: (cb, status) => { subscriptions++; onTick = cb; onStatus = status; queueMicrotask(() => status(true, 'SUBSCRIBED')); return () => { onTick = undefined } }
  }
  return { c, tick: (t: unknown) => onTick?.(t as LiveTick), status: (ok: boolean, d: string) => onStatus?.(ok, d), live: () => onTick !== undefined, subscriptions: () => subscriptions, snapshots: () => snapshots }
}
const setup = () => { const store = createAppStore('live', undefined, { ...DEFAULT_SETTINGS }); return { store, bus: createBus(store) } }

describe('BL-34 (web)', () => {
  afterEach(() => { vi.useRealTimers() })

  it('#4: a malformed tick is dropped; malformed entries in a valid tick are filtered out', async () => {
    expect(sanitizeTick(null)).toBeUndefined()
    expect(sanitizeTick({ v: 2, ts: T })).toBeUndefined()
    expect(sanitizeTick({ v: 1, ts: 'yesterday' })).toBeUndefined()
    const t = sanitizeTick({ v: 1, ts: T, pools: [{ poolId: 'a_0', status: 'open' }, { status: 'open' }, 'x'], pledges: { a_0: [{ outpoint: 'o_1' }, {}], b_0: 'no' }, health: [{ service: 'coop', ok: true }, { service: 'x' }], events: [{ id: 'e', ts: T, src: 'guard', type: 't', data: {} }, { id: 'f' }] })
    expect(t).toEqual({ v: 1, ts: T, pools: [{ poolId: 'a_0', status: 'open' }], pledges: { a_0: [{ outpoint: 'o_1' }] }, health: [{ service: 'coop', ok: true }], events: [{ id: 'e', ts: T, src: 'guard', type: 't', data: {} }] })

    const { store, bus } = setup()
    const f = client()
    const live = startSupabaseLive({ client: f.c, bus, store, onStale: () => {} })
    await live.ready
    f.tick({ v: 1, ts: T, pools: 'truncated' })
    f.tick({ garbage: true })
    expect(store.getState().pools.order).toEqual([])
    live.close()
  })

  it('#11: a channel error that does not recover falls back after the grace period, not after 45 s', async () => {
    vi.useFakeTimers()
    const { store, bus } = setup()
    const f = client()
    let stale = 0
    const live = startSupabaseLive({ client: f.c, bus, store, onStale: () => { stale++ }, errorGraceMs: 5_000, staleMs: 45_000, hiddenAfterMs: 0 })
    await vi.advanceTimersByTimeAsync(10)
    f.status(false, 'CHANNEL_ERROR: boom')
    await vi.advanceTimersByTimeAsync(2_000)
    f.status(true, 'SUBSCRIBED') // recovered in time: no fallback
    await vi.advanceTimersByTimeAsync(5_000)
    expect(stale).toBe(0)
    f.status(false, 'TIMED_OUT')
    await vi.advanceTimersByTimeAsync(5_001)
    expect(stale).toBe(1)
    live.close()
  })

  it('#11: a tab hidden for a minute leaves the channel and rejoins (with a fresh snapshot) when shown', async () => {
    vi.useFakeTimers()
    const { store, bus } = setup()
    const f = client()
    const listeners: Array<() => void> = []
    const page = { hidden: false, addEventListener: (_: 'visibilitychange', fn: () => void) => { listeners.push(fn) }, removeEventListener: () => {} }
    const live = startSupabaseLive({ client: f.c, bus, store, onStale: () => {}, hiddenAfterMs: 60_000, visibility: page })
    await vi.advanceTimersByTimeAsync(10)
    await live.ready
    const before = f.snapshots()
    page.hidden = true; for (const l of listeners) l()
    await vi.advanceTimersByTimeAsync(59_000)
    expect(f.live()).toBe(true)
    await vi.advanceTimersByTimeAsync(1_001)
    expect(f.live()).toBe(false)
    page.hidden = false; for (const l of listeners) l()
    await vi.advanceTimersByTimeAsync(10)
    expect(f.live()).toBe(true)
    expect(f.subscriptions()).toBe(2)
    expect(f.snapshots()).toBe(before + 1) // the rejoin re-reads the tables
    live.close()
  })

  it('#1: the board order is by block height, whatever order the pools arrive in', () => {
    const { store } = setup()
    const old = { ...makeMockPool(1, 10), height: 100 }
    const young = { ...makeMockPool(2, 10), height: 200 }
    store.getState().hydratePools([young])
    store.getState().hydratePools([old])
    expect(store.getState().pools.order).toEqual([old.poolId, young.poolId])
  })

  it('#14: live mode records which transport feeds it', () => {
    const { store } = setup()
    store.getState().setTransport('mirror')
    expect(store.getState().transport).toBe('mirror')
    store.getState().setTransport('direct')
    expect(store.getState().transport).toBe('direct')
  })

  it('#9: a duplicated tab (same sessionStorage id) draws a new id; a unique one keeps its id', async () => {
    const first = await claimTabId('abcd1234', 30)
    const second = await claimTabId('abcd1234', 30)
    expect(first.id).toBe('abcd1234')
    expect(second.id).not.toBe('abcd1234')
    const third = await claimTabId('ffff0000', 30)
    expect(third.id).toBe('ffff0000')
    for (const c of [first, second, third]) c.release()
  })
})
