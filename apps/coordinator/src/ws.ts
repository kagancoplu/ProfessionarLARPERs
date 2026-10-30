/**
 * WS /ws (MASTER §3.5). Faz 1: participant sessions (`hello`) and the live
 * pool feed (`pool_update`, from a poll of the overlay; only changes are sent).
 * Faz 2 sends `sign_request` to sessions by identity.
 */
import type { Server } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import { derivePools, type ApiDeps } from './api'

const IDENTITY_RE = /^0[23][0-9a-f]{64}$/
const POOL_ID_RE = /^[0-9a-f]{64}_\d+$/
const MAX_POOL_IDS = 100

export interface Session {
  identity?: string
  /** null = every pool */
  poolIds: Set<string> | null
}

export class Feed {
  private readonly wss: WebSocketServer
  readonly sessions = new Map<WebSocket, Session>()
  private readonly last = new Map<string, string>()
  private timer?: NodeJS.Timeout
  private polling = false

  constructor (server: Server, private readonly deps: ApiDeps, private readonly pollMs: number) {
    this.wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 })
    this.wss.on('connection', ws => {
      this.sessions.set(ws, { poolIds: null })
      ws.on('message', data => { void this.onMessage(ws, data.toString()) })
      ws.on('close', () => { this.sessions.delete(ws) })
      ws.on('error', () => { this.sessions.delete(ws) })
    })
  }

  start (): void {
    void this.poll()
    this.timer = setInterval(() => { void this.poll() }, this.pollMs)
  }

  /** Re-read pools; send `pool_update` for every pool whose progress or status changed. */
  async poll (): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      for (const p of await derivePools(this.deps, await this.deps.overlay.pools())) {
        const key = `${p.pledgedCredits}|${p.status}`
        if (this.last.get(p.poolId) === key) continue
        this.last.set(p.poolId, key)
        this.broadcast(p.poolId, { type: 'pool_update', poolId: p.poolId, pledgedCredits: p.pledgedCredits, status: p.status })
      }
    } catch {
      // overlay unreachable: try again next tick
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

  /** Sessions that said `hello` with this identity (Faz 2: sign_request). */
  sendTo (identity: string, msg: object): number {
    let n = 0
    for (const [ws, s] of this.sessions) {
      if (s.identity === identity && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(msg)); n++ }
    }
    return n
  }

  private async onMessage (ws: WebSocket, raw: string): Promise<void> {
    let msg: any
    try { msg = JSON.parse(raw) } catch { ws.send(JSON.stringify({ type: 'error', error: 'invalid JSON' })); return }
    if (msg?.type !== 'hello') { ws.send(JSON.stringify({ type: 'error', error: `unsupported message type ${String(msg?.type)}` })); return }
    const poolIds: unknown = msg.poolIds ?? []
    if (typeof msg.identity !== 'string' || !IDENTITY_RE.test(msg.identity) ||
        !Array.isArray(poolIds) || poolIds.length > MAX_POOL_IDS || !poolIds.every(p => typeof p === 'string' && POOL_ID_RE.test(p))) {
      ws.send(JSON.stringify({ type: 'error', error: 'hello needs identity (compressed pubkey hex) and poolIds (≤ 100 "<txid>_<vout>")' }))
      return
    }
    const session: Session = { identity: msg.identity, poolIds: poolIds.length === 0 ? null : new Set(poolIds as string[]) }
    this.sessions.set(ws, session)
    ws.send(JSON.stringify({ type: 'hello_ack', identity: session.identity, poolIds }))
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
