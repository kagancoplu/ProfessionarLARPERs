/**
 * Guard HTTP API (MASTER §3.7). POST /cosign and GET /healthz need no session:
 * the agent's signature inside the request is the proof. The owner routes
 * (PUT /vaults, PUT /policies, GET /vaults) require BRC-103 mutual auth
 * (@bsv/auth-express-middleware); the owner CLI calls them with AuthFetch.
 */
import { createAuthMiddleware, type AuthRequest } from '@bsv/auth-express-middleware'
import type { WalletInterface } from '@bsv/sdk'
import express, { type Express, type Response } from 'express'
import type { Guard, GuardResult } from './guard'

const send = (res: Response, r: GuardResult): void => { res.status(r.status).json(r.body) }

export function createGuardApp (guard: Guard, wallet: WalletInterface, opts: { network?: string } = {}): Express {
  const app = express()
  app.use(express.json({ limit: '10mb' }))

  app.get('/healthz', (_req, res) => { res.json({ ok: true, identityKey: guard.identityKey, network: opts.network ?? 'main' }) })
  app.post('/cosign', async (req, res) => { send(res, await guard.cosign(req.body)) })

  app.use(createAuthMiddleware({ wallet, allowUnauthenticated: false, logLevel: 'error' }))
  const who = (req: AuthRequest): string | undefined => req.auth?.identityKey === 'unknown' ? undefined : req.auth?.identityKey
  app.put('/vaults/:vaultId', (req: AuthRequest, res) => { send(res, guard.registerVault(who(req), String(req.params.vaultId), req.body)) })
  app.get('/vaults/:vaultId', (req: AuthRequest, res) => { send(res, guard.getVault(who(req), String(req.params.vaultId))) })
  app.put('/policies/:agentIdentity', (req: AuthRequest, res) => { send(res, guard.putPolicy(who(req), String(req.params.agentIdentity), req.body)) })
  return app
}
