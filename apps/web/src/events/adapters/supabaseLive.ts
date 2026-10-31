/**
 * Live mode over the relay's Supabase mirror (plan/phases/SUPABASE-MVP.md): subscribe first (ticks are buffered),
 * then the last 200 events into the store, then the tables' snapshot, then the buffered ticks in order. `ready`
 * rejects when the snapshot fails or takes too long; `onStale` fires once when no tick (heartbeats included)
 * arrives for `staleMs`. Either way boot.ts falls back to the direct streams.
 */
import type { LiveTick } from '@agentcoop/relay/contract'
import type { AppStoreApi } from '../../store'
import type { EventBus } from '../bus'
import type { CoopEvent } from '../types'
import { applySnapshot, applyTick, hydrateHistory, type LiveSnapshot } from './supabaseApply'

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

  const unsubscribe = client.subscribeTicks(tick => {
    if (closed) return
    arm()
    if (applying) applyTick(bus, store, tick)
    else buffer.push(tick)
  }, (ok, detail) => opts.onStatus?.(ok, detail))
  arm()

  let timeout: ReturnType<typeof setTimeout> | undefined
  const load = async (): Promise<void> => {
    // history is a nicety: an empty feed beats no live mode
    hydrateHistory(store, await client.history(HISTORY).catch(() => []))
    applySnapshot(bus, store, await client.snapshot())
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
      unsubscribe()
    }
  }
}
