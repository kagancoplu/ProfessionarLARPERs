/**
 * The event bus: every adapter (WS, SSE, mock scenario, replay player) calls `publish`;
 * the store applies the event, listeners (Town fx queue, recorder, query invalidation,
 * sounds) get it afterwards. One bus per app; tests build their own with `createBus`.
 */
import type { AppStoreApi } from '../store'
import type { AnyCoopEvent, CoopEvent } from './types'
import { isCoopEvent } from './types'

export type BusListener = (e: AnyCoopEvent) => void

export interface EventBus {
  publish: (e: CoopEvent) => void
  subscribe: (fn: BusListener) => () => void
  /** ids already seen, so a reconnecting SSE/WS cannot double-apply (bounded) */
  seen: (id: string) => boolean
}

export function createBus (store: AppStoreApi, opts: { dedupe?: boolean, seenLimit?: number } = {}): EventBus {
  const listeners = new Set<BusListener>()
  const seen = new Set<string>()
  const limit = opts.seenLimit ?? 5_000
  return {
    publish (e) {
      if (!isCoopEvent(e)) return
      if (opts.dedupe !== false) {
        const key = `${e.src}|${e.id}`
        if (seen.has(key)) return
        seen.add(key)
        if (seen.size > limit) { const first = seen.values().next().value; if (first !== undefined) seen.delete(first) }
      }
      store.getState().applyEvent(e)
      for (const fn of listeners) {
        try { fn(e) } catch (err) { console.error('[bus] listener failed', err) }
      }
    },
    subscribe (fn) { listeners.add(fn); return () => { listeners.delete(fn) } },
    seen: id => seen.has(id)
  }
}
