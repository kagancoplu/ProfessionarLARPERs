/**
 * The coordinator's WS feed as a watcher (MASTER §3.5): answer the challenge with a hello without `sig`, so
 * the relay gets pool_update / settled / round_failed / pool_failed but never a sign_request. Reconnects 2 → 30 s.
 */
import WebSocket from 'ws'
import type { Json } from './contract'

export function watchCoordinator (wsUrl: string, onMessage: (msg: Json) => void): { close (): void } {
  let closed = false
  let ws: WebSocket | undefined
  let backoff = 2_000
  let retry: ReturnType<typeof setTimeout> | undefined
  const connect = (): void => {
    ws = new WebSocket(wsUrl)
    ws.on('open', () => { backoff = 2_000 })
    ws.on('message', raw => {
      let msg: Json
      try { msg = JSON.parse(String(raw)) as Json } catch { return }
      if (msg.type === 'challenge') { ws?.send(JSON.stringify({ type: 'hello', poolIds: [] })); return }
      onMessage(msg)
    })
    ws.on('error', () => {}) // 'close' follows and reconnects
    ws.on('close', () => {
      if (closed) return
      retry = setTimeout(connect, backoff)
      backoff = Math.min(backoff * 2, 30_000)
    })
  }
  connect()
  return { close () { closed = true; if (retry !== undefined) clearTimeout(retry); ws?.close() } }
}
