/**
 * Participant client for the coordinator's WS (`@agentcoop/coordinator/client`).
 * Opens `/ws`, answers the `challenge` with a signed `hello` (auth.ts) and
 * resolves once the coordinator acknowledged a proven session. Agents (Track C)
 * then handle `sign_request` with A's verifySettlementPlan + signSettlementInput.
 */
import type { WalletInterface } from '@agentcoop/core/sdk'
import { WebSocket } from 'ws'
import { signHello } from './auth'

export interface CoordinatorSession {
  ws: WebSocket
  identity: string
  /** every message received so far, in order */
  messages: any[]
  send: (msg: object) => void
  /** first message (already received or future) matching `pred` */
  waitFor: (pred: (m: any) => boolean, ms?: number) => Promise<any>
  close: () => void
}

export interface ConnectOptions {
  /** pools to follow; empty = every pool */
  poolIds?: string[]
  /** called for every message after the handshake (sign_request, pool_update, settled …) */
  onMessage?: (msg: any, session: CoordinatorSession) => void
  timeoutMs?: number
}

export async function connectCoordinator (coopUrl: string, wallet: WalletInterface, opts: ConnectOptions = {}): Promise<CoordinatorSession> {
  const url = new URL(coopUrl)
  const wsUrl = `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}/ws`
  const { publicKey: identity } = await wallet.getPublicKey({ identityKey: true })
  const ws = new WebSocket(wsUrl)
  const messages: any[] = []
  const waiters = new Set<() => void>()
  let ready = false
  const session: CoordinatorSession = {
    ws,
    identity,
    messages,
    send: msg => { ws.send(JSON.stringify(msg)) },
    waitFor: async (pred, ms = opts.timeoutMs ?? 15_000) => await new Promise((resolve, reject) => {
      const hit = messages.find(pred)
      if (hit !== undefined) { resolve(hit); return }
      const check = (): void => {
        const m = messages.find(pred)
        if (m !== undefined) { clearTimeout(timer); waiters.delete(check); resolve(m) }
      }
      const timer = setTimeout(() => { waiters.delete(check); reject(new Error(`coordinator: timed out; got ${JSON.stringify(messages.map(m => m.type))}`)) }, ms)
      waiters.add(check)
    }),
    close: () => { ws.close() }
  }
  ws.on('message', data => {
    let msg: any
    try { msg = JSON.parse(data.toString()) } catch { return }
    messages.push(msg)
    if (msg.type === 'challenge' && typeof msg.nonce === 'string') {
      void signHello(wallet, url.host, msg.nonce).then(sig => {
        session.send({ type: 'hello', identity, poolIds: opts.poolIds ?? [], sig })
      })
    }
    if (ready) opts.onMessage?.(msg, session)
    for (const w of [...waiters]) w()
  })
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject) })
  const ack = await session.waitFor(m => m.type === 'hello_ack' || (m.type === 'error' && !ready))
  if (ack.type !== 'hello_ack' || ack.proven !== true) {
    ws.close()
    throw new Error(`coordinator refused the hello: ${JSON.stringify(ack)}`)
  }
  ready = true
  return session
}
