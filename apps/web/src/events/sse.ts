/**
 * Server-Sent Events with the MASTER §3.10 conventions: `id:` is the CoopEvent id, the browser
 * resends `Last-Event-ID` on reconnect, `: keepalive` comments are ignored. EventSource reconnects
 * by itself; we only report status.
 */
export interface SseHandle { close: () => void }

export interface SseOptions {
  onMessage: (data: string, lastEventId: string) => void
  onStatus?: (ok: boolean, detail?: string) => void
  /** custom EventSource (tests) */
  EventSourceImpl?: typeof EventSource
}

export function openSse (url: string, opts: SseOptions): SseHandle {
  const Impl = opts.EventSourceImpl ?? (typeof EventSource !== 'undefined' ? EventSource : undefined)
  if (Impl === undefined) { opts.onStatus?.(false, 'EventSource unavailable'); return { close: () => {} } }
  const es = new Impl(url)
  es.onopen = () => { opts.onStatus?.(true) }
  es.onerror = () => { opts.onStatus?.(false, es.readyState === es.CLOSED ? 'closed' : 'reconnecting') }
  es.onmessage = (ev: MessageEvent<string>) => { opts.onMessage(ev.data, ev.lastEventId) }
  return { close: () => { es.close() } }
}
