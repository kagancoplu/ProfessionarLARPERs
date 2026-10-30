/**
 * Maker HTTP (MASTER §3.10, for Track E's harbour scene): GET /healthz, GET /quote,
 * GET /events (SSE, CoopEvent src:'maker'). The swap itself runs through rail.ts;
 * in this PoC the steps are library calls (scripts and tests), not HTTP endpoints.
 */
import express, { type Express } from 'express'
import type { Address } from 'viem'
import { DEFAULT_REFUND_BLOCKS, DEFAULT_SPREAD_BPS, MIN_BASE_TIMEOUT_LEFT_S, quote } from './rail'

export interface MakerEvent { id: string, ts: string, src: 'maker', type: 'rail_quote' | 'rail_locked_base' | 'rail_funded_bsv' | 'rail_claimed' | 'rail_refunded', data: Record<string, unknown>, txid?: string }

export interface MakerConfig {
  satsPerUsdc: number
  spreadBps?: number
  /** Most the maker swaps per quote (USDC base units) and its BSV identity / EVM address. */
  maxUsdc: bigint
  makerEvm: Address
  makerBsv: string
  network: { evm: string, htlc?: Address, token?: Address, bsv: string }
}

export class MakerEvents {
  readonly buffer: MakerEvent[] = []
  private seq = 0
  private readonly subs = new Set<(e: MakerEvent) => void>()
  emit (type: MakerEvent['type'], data: Record<string, unknown>, txid?: string): MakerEvent {
    const e: MakerEvent = { id: `maker:${++this.seq}`, ts: new Date().toISOString(), src: 'maker', type, data, ...(txid !== undefined ? { txid } : {}) }
    this.buffer.push(e)
    if (this.buffer.length > 500) this.buffer.shift()
    for (const s of this.subs) s(e)
    return e
  }
  subscribe (fn: (e: MakerEvent) => void): () => void { this.subs.add(fn); return () => { this.subs.delete(fn) } }
}

export function createMakerApp (cfg: MakerConfig, events = new MakerEvents()): Express {
  const app = express()
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', process.env.MAKER_CORS_ORIGIN || '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Last-Event-ID')
    if (req.method === 'OPTIONS') { res.sendStatus(204); return }
    next()
  })
  app.get('/healthz', (_req, res) => { res.json({ ok: true, maker: { evm: cfg.makerEvm, bsv: cfg.makerBsv }, network: cfg.network }) })
  app.get('/quote', (req, res) => {
    if (req.query.dir !== undefined && req.query.dir !== 'usdc-bsv') { res.status(400).json({ reason: 'only dir=usdc-bsv (the reverse direction is not built yet)' }); return }
    const raw = String(req.query.amount ?? '')
    if (!/^[1-9]\d{0,15}$/.test(raw)) { res.status(400).json({ reason: 'amount: USDC base units (6 decimals), a positive integer' }); return }
    const usdc = BigInt(raw)
    if (usdc > cfg.maxUsdc) { res.status(400).json({ reason: `at most ${cfg.maxUsdc} base units per swap (PoC)` }); return }
    const q = quote(usdc, cfg.satsPerUsdc, cfg.spreadBps ?? DEFAULT_SPREAD_BPS)
    const body = {
      dir: 'usdc-bsv', usdc: q.usdc.toString(), sats: q.sats, satsPerUsdc: q.satsPerUsdc, spreadBps: q.spreadBps, expiresAt: q.expiresAt,
      maker: { evm: cfg.makerEvm, bsv: cfg.makerBsv }, htlc: cfg.network.htlc, token: cfg.network.token,
      terms: { hash: 'sha256', minBaseTimeoutLeftS: MIN_BASE_TIMEOUT_LEFT_S, bsvRefundBlocks: DEFAULT_REFUND_BLOCKS, landsIn: 'vault (agent + guard claim)' }
    }
    events.emit('rail_quote', { usdc: body.usdc, sats: body.sats, spreadBps: body.spreadBps })
    res.json(body)
  })
  app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.flushHeaders()
    const write = (e: MakerEvent): void => { res.write(`id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`) }
    const last = Number(String(req.header('Last-Event-ID') ?? '').split(':')[1] ?? 0)
    for (const e of events.buffer) if (Number(e.id.split(':')[1]) > last) write(e)
    const off = events.subscribe(write)
    const ka = setInterval(() => { res.write(': keepalive\n\n') }, 15_000)
    req.on('close', () => { clearInterval(ka); off() })
  })
  return app
}
