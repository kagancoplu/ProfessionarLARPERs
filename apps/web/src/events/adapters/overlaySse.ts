/** Overlay SSE adapter: raw `admitted`/`spent` + the derived events (derive.ts), debounced per burst. */
import type { CoopApi } from '../../api/coop'
import type { AppStoreApi } from '../../store'
import type { EventBus } from '../bus'
import { derivePledgeDiff, derivePoolDiff } from '../derive'
import { openSse, type SseHandle } from '../sse'
import { makeEvent } from '../types'

export interface OverlaySseOptions {
  url: string
  bus: EventBus
  store: AppStoreApi
  coop: CoopApi
  onStatus?: (ok: boolean, detail?: string) => void
  debounceMs?: number
  EventSourceImpl?: typeof EventSource
}

export function startOverlaySse (opts: OverlaySseOptions): SseHandle & { refresh: () => Promise<void> } {
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = false
  let again = false

  const refresh = async (): Promise<void> => {
    if (running) { again = true; return }
    running = true
    try {
      do {
        again = false
        const ts = new Date().toISOString()
        const pools = await opts.coop.pools()
        const prevPools = opts.store.getState().pools.byId
        const poolEvents = derivePoolDiff(prevPools, pools, ts)
        opts.store.getState().hydratePools(pools, ts)
        for (const e of poolEvents) opts.bus.publish(e)
        // pledges of the pools that changed (or are new)
        const changed = new Set(poolEvents.map(e => e.poolId).filter((id): id is string => id !== undefined))
        for (const poolId of changed) {
          const pledges = await opts.coop.pledges(poolId, true)
          const prev = opts.store.getState().pools.byId[poolId]?.pledges
          for (const e of derivePledgeDiff(prev, pledges, poolId, ts)) opts.bus.publish(e)
          opts.store.getState().setPledges(poolId, pledges)
        }
      } while (again)
    } catch (err) {
      opts.onStatus?.(false, `refresh failed: ${String((err as Error).message ?? err)}`)
    } finally {
      running = false
    }
  }

  const handle = openSse(opts.url, {
    EventSourceImpl: opts.EventSourceImpl,
    onStatus: opts.onStatus,
    onMessage: data => {
      let msg: { type?: string, txid?: string }
      try { msg = JSON.parse(data) } catch { return }
      if ((msg.type !== 'admitted' && msg.type !== 'spent') || typeof msg.txid !== 'string') return
      opts.bus.publish(makeEvent('overlay', msg.type, { txid: msg.txid }, { txid: msg.txid }))
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(() => { timer = undefined; void refresh() }, opts.debounceMs ?? 150)
    }
  })
  return { close: () => { if (timer !== undefined) clearTimeout(timer); handle.close() }, refresh }
}
