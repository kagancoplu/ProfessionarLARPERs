/**
 * Coordinator WS /ws (MASTER §3.5). Watchers get `pool_update` without `hello`
 * (verified in apps/coordinator/src/ws.ts); a connected wallet says `hello { identity, poolIds }`
 * so it receives `sign_request`. Reconnects with backoff 1 s → 30 s and repeats `hello`.
 */
import type { EventBus } from '../bus'
import { makeEvent, type CoopEventMap } from '../types'

export interface CoordinatorFeedOptions {
  url: string
  bus: EventBus
  onStatus?: (ok: boolean, detail?: string) => void
  /** identity to announce (undefined = watcher) */
  identity?: () => string | undefined
  /** sign the coordinator's challenge nonce (B-P5a); without it the session only watches */
  prove?: (nonce: string) => Promise<string>
  WebSocketImpl?: typeof WebSocket
  maxBackoffMs?: number
}

export interface CoordinatorFeed {
  close: () => void
  hello: (identity: string, poolIds?: string[]) => void
  send: (msg: object) => boolean
  readonly connected: boolean
}

type WsType = 'pool_update' | 'sign_request' | 'settled' | 'round_failed' | 'pool_failed' | 'hello_ack' | 'error'
const KNOWN = new Set<WsType>(['pool_update', 'sign_request', 'settled', 'round_failed', 'pool_failed', 'hello_ack', 'error'])

export function startCoordinatorFeed (opts: CoordinatorFeedOptions): CoordinatorFeed {
  const Impl = opts.WebSocketImpl ?? (typeof WebSocket !== 'undefined' ? WebSocket : undefined)
  let ws: WebSocket | undefined
  let closed = false
  let backoff = 1_000
  let timer: ReturnType<typeof setTimeout> | undefined
  let connected = false
  let lastHello: { identity: string, poolIds: string[] } | undefined
  let nonce: string | undefined

  const sayHello = async (identity: string, poolIds: string[]): Promise<void> => {
    let sig: string | undefined
    if (nonce !== undefined && opts.prove !== undefined) {
      try { sig = await opts.prove(nonce) } catch (err) { console.warn('[coordinator] hello proof failed; watching only', err) }
    }
    send({ type: 'hello', identity, poolIds, ...(sig !== undefined ? { sig } : {}) })
  }

  const send = (msg: object): boolean => {
    if (ws === undefined || ws.readyState !== 1) return false
    ws.send(JSON.stringify(msg))
    return true
  }

  const connect = (): void => {
    if (closed || Impl === undefined) { if (Impl === undefined) opts.onStatus?.(false, 'WebSocket unavailable'); return }
    ws = new Impl(opts.url)
    ws.onopen = () => {
      connected = true
      backoff = 1_000
      nonce = undefined
      opts.onStatus?.(true)
    }
    ws.onmessage = ev => {
      let msg: { type?: string, [k: string]: unknown }
      try { msg = JSON.parse(String(ev.data)) } catch { return }
      const type = msg.type
      if (type === 'challenge' && typeof msg.nonce === 'string') {
        // B-P5a: the server opens with a nonce; a connected wallet proves its identity, a watcher says hello without sig
        nonce = msg.nonce
        const identity = lastHello?.identity ?? opts.identity?.()
        if (identity !== undefined) void sayHello(identity, lastHello?.poolIds ?? [])
        return
      }
      if (typeof type !== 'string' || !KNOWN.has(type as WsType)) return
      const { type: _t, ...data } = msg
      const poolId = typeof data.poolId === 'string' ? data.poolId : undefined
      const txid = typeof data.txid === 'string' ? data.txid : undefined
      opts.bus.publish(makeEvent('coordinator', type as WsType, data as CoopEventMap[WsType], { ...(poolId !== undefined ? { poolId } : {}), ...(txid !== undefined ? { txid } : {}) }))
    }
    ws.onclose = () => {
      connected = false
      opts.onStatus?.(false, closed ? 'closed' : `reconnecting in ${Math.round(backoff / 1000)} s`)
      if (closed) return
      timer = setTimeout(connect, backoff)
      backoff = Math.min(backoff * 2, opts.maxBackoffMs ?? 30_000)
    }
    ws.onerror = () => { /* onclose follows */ }
  }
  connect()

  return {
    close () { closed = true; if (timer !== undefined) clearTimeout(timer); ws?.close() },
    hello (identity, poolIds = []) { lastHello = { identity, poolIds }; void sayHello(identity, poolIds) },
    send,
    get connected () { return connected }
  }
}
