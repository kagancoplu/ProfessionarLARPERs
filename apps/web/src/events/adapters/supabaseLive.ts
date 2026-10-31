/**
 * Live mode over the relay's Supabase mirror (plan/phases/SUPABASE-MVP.md): subscribe first and wait until it is
 * live (ticks are buffered), then the last 200 events into the store, then the tables' snapshot, then the buffered
 * ticks in order; every later rejoin re-reads the snapshot and publishes what changed. `ready`
 * rejects when the snapshot fails or takes too long; `onStale` fires once when no tick (heartbeats included)
 * arrives for `staleMs`. Either way boot.ts falls back to the direct streams.
 */
import type { LiveTick } from '@agentcoop/relay/contract'
import type { AppStoreApi } from '../../store'
import type { EventBus } from '../bus'
import type { CoopEvent } from '../types'
import { applySnapshot, applyTick, hydrateHistory, sanitizeTick, type LiveSnapshot } from './supabaseApply'

/** The three reads the adapter needs (api/supabase.ts implements it on supabase-js; tests fake it). */
export interface LiveClient {
  snapshot (): Promise<LiveSnapshot>
  history (limit: number): Promise<CoopEvent[]>
  subscribeTicks (onTick: (t: LiveTick) => void, onStatus: (ok: boolean, detail?: string) => void): () => void
}

export interface SupabaseLiveOptions {
  client: LiveClient
  bus: EventBus
  store: AppStoreApi
  onStatus?: (ok: boolean, detail?: string) => void
  onStale: () => void
  staleMs?: number
  snapshotTimeoutMs?: number
  /** a channel error or timeout that is not back up within this falls back at once, not after staleMs (BL-34 #11). Default 5 s */
  errorGraceMs?: number
  /** a tab hidden this long drops its subscription (free-plan quota) and rejoins when shown. Default 60 s; 0 = never */
  hiddenAfterMs?: number
  /** the page's visibility (tests pass their own); default `document` when there is one */
  visibility?: { hidden: boolean, addEventListener: (type: 'visibilitychange', fn: () => void) => void, removeEventListener: (type: 'visibilitychange', fn: () => void) => void }
}

const HISTORY = 200

export function startSupabaseLive (opts: SupabaseLiveOptions): { close: () => void, ready: Promise<void> } {
  const { client, bus, store } = opts
  let applying = false
  let closed = false
  const buffer: LiveTick[] = []
  let stale: ReturnType<typeof setTimeout> | undefined
  let staleFired = false
  const arm = (): void => {
    if (stale !== undefined) clearTimeout(stale)
    stale = setTimeout(() => {
      if (closed || staleFired) return
      staleFired = true
      opts.onStale()
    }, opts.staleMs ?? 45_000)
  }

  // Ticks are deltas: read the tables only once the subscription is live, and again after every rejoin, so a
  // tick published while the channel was down (network blip, laptop sleep) cannot be lost for good.
  let subscribed: () => void = () => {}
  const firstSubscribe = new Promise<void>(resolve => { subscribed = resolve })
  let wasUp = false
  let everUp = false
  const resync = async (): Promise<void> => {
    try {
      const snap = await client.snapshot()
      if (!closed && applying) applyTick(bus, store, { v: 1, ts: new Date().toISOString(), ...snap } as unknown as LiveTick)
    } catch (err) { opts.onStatus?.(false, `resync failed: ${String((err as Error).message ?? err)}`) }
  }
  let grace: ReturnType<typeof setTimeout> | undefined
  const fallBackNow = (): void => {
    if (closed || staleFired) return
    staleFired = true
    opts.onStale()
  }
  let unsubscribe = (): void => {}
  const subscribe = (): void => {
    unsubscribe = client.subscribeTicks(raw => {
      if (closed) return
      const tick = sanitizeTick(raw)
      if (tick === undefined) return // not a tick: never let it reach the reducers
      arm()
      if (applying) applyTick(bus, store, tick)
      else buffer.push(tick)
    }, (ok, detail) => {
      opts.onStatus?.(ok, detail)
      if (ok) { if (grace !== undefined) { clearTimeout(grace); grace = undefined } } else if (/CHANNEL_ERROR|TIMED_OUT/.test(detail ?? '') && grace === undefined) {
        // a broken channel rarely heals by itself: give it a moment, then read the services directly
        grace = setTimeout(fallBackNow, opts.errorGraceMs ?? 5_000)
      }
      if (ok && !wasUp) {
        if (!everUp) { everUp = true; subscribed() } else void resync()
      }
      wasUp = ok
    })
  }
  subscribe()
  arm()

  // a hidden tab costs Realtime quota for nothing: leave after hiddenAfterMs, rejoin (and resync) when shown again
  const page = opts.visibility ?? (typeof document !== 'undefined' ? document : undefined)
  let away: ReturnType<typeof setTimeout> | undefined
  let parked = false
  const onVisibility = (): void => {
    if (closed || page === undefined) return
    if (page.hidden) {
      if ((opts.hiddenAfterMs ?? 60_000) <= 0 || away !== undefined) return
      away = setTimeout(() => {
        away = undefined
        if (closed || !page.hidden) return
        parked = true
        unsubscribe()
        wasUp = false
        if (stale !== undefined) clearTimeout(stale)
      }, opts.hiddenAfterMs ?? 60_000)
    } else {
      if (away !== undefined) { clearTimeout(away); away = undefined }
      if (parked) { parked = false; subscribe(); arm() }
    }
  }
  page?.addEventListener('visibilitychange', onVisibility)

  let timeout: ReturnType<typeof setTimeout> | undefined
  const load = async (): Promise<void> => {
    await firstSubscribe
    // history is a nicety: an empty feed beats no live mode
    const history = await client.history(HISTORY).catch(() => [])
    if (closed) return
    hydrateHistory(store, history, bus)
    const snap = await client.snapshot()
    if (closed) return
    applySnapshot(store, snap)
  }
  const limit = new Promise<never>((_resolve, reject) => {
    const ms = opts.snapshotTimeoutMs ?? 5_000
    timeout = setTimeout(() => reject(new Error(`Supabase snapshot timed out after ${ms} ms`)), ms)
  })
  const ready = Promise.race([load(), limit]).then(() => {
    if (closed) return
    applying = true
    for (const t of buffer.splice(0)) applyTick(bus, store, t)
  }).finally(() => { if (timeout !== undefined) clearTimeout(timeout) })

  return {
    ready,
    close () {
      closed = true
      if (stale !== undefined) clearTimeout(stale)
      if (grace !== undefined) clearTimeout(grace)
      if (away !== undefined) clearTimeout(away)
      page?.removeEventListener('visibilitychange', onVisibility)
      unsubscribe()
    }
  }
}
