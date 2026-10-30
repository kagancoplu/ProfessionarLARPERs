/**
 * Guard HTTP API (MASTER §3.7, §3.10). POST /cosign, GET /healthz and GET /events
 * need no session: the agent's signature inside a /cosign request is the proof,
 * and the event stream carries no secrets. The owner/agent routes (PUT /vaults,
 * PUT and GET /policies, GET /vaults, GET /decisions) require BRC-103 mutual auth
 * (@bsv/auth-express-middleware); the owner CLI and the web console use AuthFetch.
 * CORS is open (GUARD_CORS_ORIGIN, default *) and exposes the BRC-103 headers so
 * a browser's AuthFetch can read them (MASTER §3.10).
 */
import { createAuthMiddleware, type AuthRequest } from '@bsv/auth-express-middleware'
import type { WalletInterface } from '@agentcoop/core/sdk'
import express, { type Express, type Response } from 'express'
import type { Guard, GuardEvent, GuardResult } from './guard'

const send = (res: Response, r: GuardResult): void => { res.status(r.status).json(r.body) }

const AUTH_HEADERS = [
  'x-bsv-auth-version', 'x-bsv-auth-identity-key', 'x-bsv-auth-nonce', 'x-bsv-auth-your-nonce', 'x-bsv-auth-signature',
  'x-bsv-auth-message-type', 'x-bsv-auth-request-id', 'x-bsv-auth-requested-certificates'
].join(', ')
const KEEPALIVE_MS = 15_000

export function createGuardApp (guard: Guard, wallet: WalletInterface, opts: { network?: string, corsOrigin?: string } = {}): Express {
  const app = express()
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', opts.corsOrigin ?? (process.env.GUARD_CORS_ORIGIN || '*'))
    res.setHeader('Access-Control-Allow-Headers', `Content-Type, Last-Event-ID, ${AUTH_HEADERS}`)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
    res.setHeader('Access-Control-Expose-Headers', AUTH_HEADERS)
    if (req.method === 'OPTIONS') { res.sendStatus(204); return }
    next()
  })
  app.use(express.json({ limit: '10mb' }))

  app.get('/healthz', (_req, res) => { res.json({ ok: true, identityKey: guard.identityKey, network: opts.network ?? 'main' }) })
  app.post('/cosign', async (req, res) => { send(res, await guard.cosign(req.body)) })
  app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()
    const write = (e: GuardEvent): void => { res.write(`id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`) }
    const last = Number(String(req.header('Last-Event-ID') ?? '').split(':')[1] ?? 0)
    for (const e of guard.events) if (Number(e.id.split(':')[1]) > last) write(e)
    const unsubscribe = guard.subscribe(write)
    const keepalive = setInterval(() => { res.write(': keepalive\n\n') }, KEEPALIVE_MS)
    req.on('close', () => { clearInterval(keepalive); unsubscribe() })
  })

  app.use(createAuthMiddleware({ wallet, allowUnauthenticated: false, logLevel: 'error' }))
  const who = (req: AuthRequest): string | undefined => req.auth?.identityKey === 'unknown' ? undefined : req.auth?.identityKey
  app.put('/vaults/:vaultId', (req: AuthRequest, res) => { send(res, guard.registerVault(who(req), String(req.params.vaultId), req.body)) })
  app.get('/vaults/:vaultId', (req: AuthRequest, res) => { send(res, guard.getVault(who(req), String(req.params.vaultId))) })
  app.put('/policies/:agentIdentity', (req: AuthRequest, res) => { send(res, guard.putPolicy(who(req), String(req.params.agentIdentity), req.body)) })
  app.get('/policies/:agentIdentity', (req: AuthRequest, res) => { send(res, guard.getPolicyFor(who(req), String(req.params.agentIdentity))) })
  app.get('/decisions', (req: AuthRequest, res) => {
    const agent = typeof req.query.agent === 'string' && req.query.agent !== '' ? req.query.agent : undefined
    send(res, guard.listDecisions(who(req), agent, Number(req.query.limit ?? 50)))
  })
  return app
}
