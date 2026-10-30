/** Sources that already speak the CoopEvent envelope (guard, agents, provider, maker): one adapter. */
import type { EventBus } from '../bus'
import { openSse, type SseHandle } from '../sse'
import { isCoopEvent, type EventSource as CoopSource } from '../types'

export function startEnvelopeSse (src: CoopSource, url: string, bus: EventBus, onStatus?: (ok: boolean, detail?: string) => void): SseHandle {
  return openSse(url, {
    onStatus,
    onMessage: data => {
      let parsed: unknown
      try { parsed = JSON.parse(data) } catch { return }
      if (!isCoopEvent(parsed)) return
      bus.publish({ ...parsed, src: parsed.src ?? src })
    }
  })
}
