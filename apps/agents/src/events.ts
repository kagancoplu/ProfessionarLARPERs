/**
 * The agents' live feed for the web app (MASTER §3.10, E → C):
 *
 *   GET /healthz   { ok: true }
 *   GET /agents    [{ name, profile, identity, mode, vaultId? }]
 *   GET /events    SSE of CoopEvent envelopes: `id: <id>\ndata: <json>\n\n`,
 *                  `: keepalive` every 15 s, resume with Last-Event-ID (last 500 kept)
 *
 * Event types: agent_started, agent_thought, agent_decision, agent_job,
 * agent_payment, agent_injected. CORS is open by default (AGENTS_CORS_ORIGIN).
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface CoopEvent<D = unknown> {
  id: string
  ts: string
  src: 'agents'
  type: string
  data: D
  txid?: string
  poolId?: string
  /** Agent identity key. */
  agent?: string
}

export interface AgentInfo { name: string, profile: string, identity: string, mode: 'p2pkh' | 'vault', vaultId?: string }

export type EventExtra = Pick<CoopEvent, 'txid' | 'poolId' | 'agent'>

export const KEEP_EVENTS = 500

export class AgentEvents {
  private seq = 0
  private readonly buffer: CoopEvent[] = []
  private readonly subscribers = new Set<(e: CoopEvent) => void>()

  publish (type: string, data: unknown, extra: EventExtra = {}): CoopEvent {
    const e: CoopEvent = { id: `agents:${++this.seq}`, ts: new Date().toISOString(), src: 'agents', type, data }
    for (const k of ['txid', 'poolId', 'agent'] as const) if (extra[k] !== undefined) e[k] = extra[k]
    this.buffer.push(e)
    if (this.buffer.length > KEEP_EVENTS) this.buffer.shift()
    for (const s of this.subscribers) s(e)
    return e
  }

  /** Events after `lastId` ("agents:41"), or all kept ones. */
  since (lastId?: string): CoopEvent[] {
    const n = lastId === undefined ? 0 : Number(lastId.split(':').pop())
    return Number.isFinite(n) ? this.buffer.filter(e => Number(e.id.split(':').pop()) > n) : [...this.buffer]
  }

  subscribe (fn: (e: CoopEvent) => void): () => void {
    this.subscribers.add(fn)
    return () => { this.subscribers.delete(fn) }
  }
}

export interface AgentsServerOptions {
  port: number
  events: AgentEvents
  agents: () => AgentInfo[]
  /** Access-Control-Allow-Origin. Default '*'. */
  corsOrigin?: string
}

export async function startAgentsServer (opts: AgentsServerOptions): Promise<{ url: string, close: () => Promise<void> }> {
  const streams = new Set<ServerResponse>()
  const cors = (res: ServerResponse): void => {
    res.setHeader('Access-Control-Allow-Origin', opts.corsOrigin ?? '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Last-Event-ID, Cache-Control')
  }
  const json = (res: ServerResponse, status: number, body: unknown): void => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    cors(res)
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
    if (req.method !== 'GET') { json(res, 405, { error: 'method not allowed' }); return }
    if (url.pathname === '/healthz') { json(res, 200, { ok: true }); return }
    if (url.pathname === '/agents') { json(res, 200, opts.agents()); return }
    if (url.pathname !== '/events') { json(res, 404, { error: 'not found' }); return }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    const send = (e: CoopEvent): void => { res.write(`id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`) }
    const lastId = (req.headers['last-event-id'] as string | undefined) ?? url.searchParams.get('lastEventId') ?? undefined
    for (const e of opts.events.since(lastId)) send(e)
    const unsubscribe = opts.events.subscribe(send)
    const keepalive = setInterval(() => { res.write(': keepalive\n\n') }, 15_000)
    streams.add(res)
    req.on('close', () => { clearInterval(keepalive); unsubscribe(); streams.delete(res) })
  })
  await new Promise<void>(resolve => server.listen(opts.port, resolve))
  return {
    url: `http://localhost:${(server.address() as AddressInfo).port}`,
    close: async () => {
      for (const s of streams) s.end()
      await new Promise(resolve => server.close(() => resolve(undefined)))
    }
  }
}
