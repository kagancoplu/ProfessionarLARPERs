/**
 * WS /ws (MASTER §3.5): participant sessions (`hello`), the live pool feed
 * (`pool_update`, from a poll of the overlay; only changes are sent), and the
 * signing-round messages (`sign_request` out by identity; `sign_response` /
 * `sign_reject` in, handed to the engine with the session's identity).
 *
 * B-P5a: every connection gets a `challenge { nonce }`; only a `hello` signed
 * over it (auth.ts) proves the identity. Unproven sessions watch the feed but
 * get no `sign_request` and cannot answer one. Per-IP connection cap and
 * per-connection message rate.
 */
import { randomBytes } from 'node:crypto'
import type { IncomingMessage, Server } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import { isLoopback, WindowCounter } from '../../../packages/overlay/src/limits'
import { derivePools, type ApiDeps } from './api'
import { verifyHello } from './auth'

const IDENTITY_RE = /^0[23][0-9a-f]{64}$/
const POOL_ID_RE = /^[0-9a-f]{64}_\d+$/
const MAX_POOL_IDS = 100

export interface Session {
  identity?: string
  /** the identity signed this connection's nonce (B-P5a) */
  proven: boolean
  /** null = every pool */
  poolIds: Set<string> | null
  nonce: string
  host: string
  ip: string
}

export interface FeedLimits {
  /** connections per IP (loopback exempt) */
  maxPerIp: number
  maxClients: number
  /** messages per connection per 10 s */
  maxMessagesPer10s: number
}

export const DEFAULT_FEED_LIMITS: FeedLimits = { maxPerIp: 20, maxClients: 1000, maxMessagesPer10s: 40 }

const provenIdentity = (s: Session | undefined): string | undefined => s?.proven === true ? s.identity : undefined

export class Feed {
  private readonly wss: WebSocketServer
  readonly sessions = new Map<WebSocket, Session>()
  private readonly last = new Map<string, string>()
  private timer?: NodeJS.Timeout
  private polling = false
  private again = false
  /** Set by the server when the engine runs (Faz 2). Returns an error to send back, if any. */
  onParticipantMessage?: (identity: string | undefined, msg: any) => string | undefined

  constructor (server: Server, private readonly deps: ApiDeps, private readonly pollMs: number, private readonly limits: FeedLimits = DEFAULT_FEED_LIMITS) {
    this.wss = new WebSocketServer({ server, path: '/ws', maxPayload: 256 * 1024 })
    this.wss.on('connection', (ws, req) => { this.onConnection(ws, req) })
  }

  private onConnection (ws: WebSocket, req: IncomingMessage): void {
    // Behind Caddy (on loopback) the client address is the last X-Forwarded-For hop: Caddy appends
    // it, and anything before it is whatever the client sent (same rule as express 'trust proxy').
    const peer = req.socket.remoteAddress
    const ip = isLoopback(peer) ? (String(req.headers['x-forwarded-for'] ?? '').split(',').pop()?.trim() || peer || 'unknown') : (peer ?? 'unknown')
    const fromIp = [...this.sessions.values()].filter(s => s.ip === ip).length
    if (this.sessions.size >= this.limits.maxClients || (!isLoopback(ip) && fromIp >= this.limits.maxPerIp)) {
      ws.close(1013, 'too many connections')
      return
    }
    const nonce = randomBytes(32).toString('hex')
    const host = String(req.headers.host ?? '').toLowerCase()
    this.sessions.set(ws, { proven: false, poolIds: null, nonce, host, ip })
    const rate = new WindowCounter(this.limits.maxMessagesPer10s, 10_000)
    ws.on('message', data => {
      if (rate.hit('m') > 0) { ws.close(1008, 'message rate'); return }
      void this.onMessage(ws, data.toString())
    })
    ws.on('close', () => { this.sessions.delete(ws) })
    ws.on('error', () => { this.sessions.delete(ws) })
    ws.send(JSON.stringify({ type: 'challenge', nonce }))
  }

  start (): void {
    void this.poll()
    this.timer = setInterval(() => { void this.poll() }, this.pollMs)
  }

  /** Re-read pools; send `pool_update` for every pool whose progress or status changed. A call during a poll runs one more poll. */
  async poll (): Promise<void> {
    if (this.polling) { this.again = true; return }
    this.polling = true
    try {
      do {
        this.again = false
        try {
          for (const p of await derivePools(this.deps, await this.deps.overlay.pools())) {
            const key = `${p.pledgedCredits}|${p.status}`
            if (this.last.get(p.poolId) === key) continue
            this.last.set(p.poolId, key)
            this.broadcast(p.poolId, { type: 'pool_update', poolId: p.poolId, pledgedCredits: p.pledgedCredits, status: p.status })
          }
        } catch {
          // overlay unreachable: try again next tick
        }
      } while (this.again)
    } finally {
      this.polling = false
    }
  }

  broadcast (poolId: string, msg: object): void {
    const data = JSON.stringify(msg)
    for (const [ws, s] of this.sessions) {
      if (ws.readyState === WebSocket.OPEN && (s.poolIds === null || s.poolIds.has(poolId))) ws.send(data)
    }
  }

  /** Sessions that proved this identity (Faz 2: sign_request). `msg` may be pre-serialized JSON (B.P6b: the plan is serialized once per round). */
  sendTo (identity: string, msg: object | string): number {
    let n = 0
    let data: string | undefined
    for (const [ws, s] of this.sessions) {
      if (s.proven && s.identity === identity && ws.readyState === WebSocket.OPEN) {
        data ??= typeof msg === 'string' ? msg : JSON.stringify(msg)
        ws.send(data)
        n++
      }
    }
    return n
  }

  /** Connected clients and how many proved an identity (healthz). */
  counts (): { clients: number, proven: number } {
    let proven = 0
    for (const s of this.sessions.values()) if (s.proven) proven++
    return { clients: this.sessions.size, proven }
  }

  private async onMessage (ws: WebSocket, raw: string): Promise<void> {
    let msg: any
    try { msg = JSON.parse(raw) } catch { ws.send(JSON.stringify({ type: 'error', error: 'invalid JSON' })); return }
    if (msg?.type === 'sign_response' || msg?.type === 'sign_reject') {
      const error = this.onParticipantMessage === undefined
        ? 'this coordinator runs no signing rounds'
        : this.onParticipantMessage(provenIdentity(this.sessions.get(ws)), msg)
      if (error !== undefined) ws.send(JSON.stringify({ type: 'error', poolId: msg.poolId, error }))
      return
    }
    if (msg?.type !== 'hello') { ws.send(JSON.stringify({ type: 'error', error: `unsupported message type ${String(msg?.type)}` })); return }
    const poolIds: unknown = msg.poolIds ?? []
    const prev = this.sessions.get(ws)
    if (prev === undefined) return
    if ((msg.identity !== undefined && (typeof msg.identity !== 'string' || !IDENTITY_RE.test(msg.identity))) ||
        !Array.isArray(poolIds) || poolIds.length > MAX_POOL_IDS || !poolIds.every(p => typeof p === 'string' && POOL_ID_RE.test(p))) {
      ws.send(JSON.stringify({ type: 'error', error: 'hello needs poolIds (≤ 100 "<txid>_<vout>") and, to sign, identity (compressed pubkey hex) + sig over the challenge' }))
      return
    }
    const identity: string | undefined = msg.identity
    if (identity !== undefined && msg.sig !== undefined && !(await verifyHello(identity, prev.host, prev.nonce, msg.sig))) {
      ws.send(JSON.stringify({ type: 'error', error: 'hello sig does not prove this identity (sign "agentcoop hello\\n<host>\\n<nonce>", protocol [1, "agentcoop hello"], keyID "1", counterparty "anyone")' }))
      return
    }
    const proven = identity !== undefined && msg.sig !== undefined
    const { identity: _old, ...rest } = prev
    const session: Session = { ...rest, ...(identity !== undefined ? { identity } : {}), proven, poolIds: poolIds.length === 0 ? null : new Set(poolIds as string[]) }
    this.sessions.set(ws, session)
    ws.send(JSON.stringify({ type: 'hello_ack', identity: session.identity, poolIds, proven }))
    // Current state of the subscribed pools, so a new participant does not wait for the next change.
    try {
      for (const p of await derivePools(this.deps, await this.deps.overlay.pools())) {
        if (session.poolIds === null || session.poolIds.has(p.poolId)) {
          ws.send(JSON.stringify({ type: 'pool_update', poolId: p.poolId, pledgedCredits: p.pledgedCredits, status: p.status }))
        }
      }
    } catch {
      // overlay unreachable: the poll will catch up
    }
  }

  async close (): Promise<void> {
    if (this.timer !== undefined) clearInterval(this.timer)
    for (const ws of this.sessions.keys()) ws.terminate()
    await new Promise<void>(resolve => this.wss.close(() => resolve()))
  }
}
