/**
 * Subscribe to the overlay's GET /agentcoop/events (Server-Sent Events, B.P3)
 * and call `onEvent` for each event, reconnecting with backoff (1 s … 30 s).
 * Lets the coordinator update pools and start rounds within a second of a
 * pledge reaching the overlay, instead of waiting for the next poll.
 */
import type { Logger } from './log'

export function subscribeOverlayEvents (overlayUrl: string, onEvent: (e: { type: string, txid: string }) => void, log: Logger): { close: () => void } {
  let closed = false
  let controller: AbortController | undefined
  void (async () => {
    let backoff = 1_000
    while (!closed) {
      controller = new AbortController()
      try {
        const res = await fetch(`${overlayUrl}/agentcoop/events`, { signal: controller.signal })
        if (!res.ok || res.body === null) throw new Error(`status ${res.status}`)
        log('overlay_events_connected', { overlayUrl })
        backoff = 1_000
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let end
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, end)
            buffer = buffer.slice(end + 2)
            for (const line of frame.split('\n')) {
              if (!line.startsWith('data:')) continue
              try { onEvent(JSON.parse(line.slice(5).trim())) } catch { /* ignore malformed */ }
            }
          }
        }
      } catch (e) {
        if (closed) return
        log('overlay_events_disconnected', { error: String((e as Error).message ?? e), retryMs: backoff })
      }
      if (closed) return
      await new Promise(resolve => setTimeout(resolve, backoff))
      backoff = Math.min(backoff * 2, 30_000)
    }
  })()
  return { close: () => { closed = true; controller?.abort() } }
}
