/**
 * Simulated GPU provider API (MASTER §3.6), BRC-105 paid routes.
 *
 * Every route except /healthz is mutually authenticated (BRC-103/104,
 * @bsv/auth-express-middleware), so the caller's identity key is known. The
 * payment middleware (@bsv/payment-express-middleware) asks for
 * `calculateRequestPrice(req)` sats: 402 → `AuthFetch` pays → retried with
 * x-bsv-payment → the provider-api wallet internalizes it (replay = 409).
 *
 * A job is free when the caller's prepaid balance covers it: the price
 * function debits the job's minutes and returns 0 (FINAL-IDEA §4.7). Otherwise
 * the whole job is charged at retail, per minute. Credits get there with
 * /v1/credits/redeem (one gpu-h100 credit = 60 prepaid minutes).
 */
import express, { type Express, type Response } from 'express'
import { createAuthMiddleware } from '@bsv/auth-express-middleware'
import { createPaymentMiddleware, type PaymentReplayStore, type PaymentRequest } from '@bsv/payment-express-middleware'
import type { WalletInterface } from '@agentcoop/core/sdk'
import { MAX_PENDING_REDEEM_CREDITS, MAX_REDEEM_CREDITS, TokenKit, type OverlayClient, type TxFetcher } from '@agentcoop/core'
import { CreditLedger } from './credits'
import { defaultProduct, retailSatsFor, runnerIdOf, unitsPerCredit, type Product } from './products'
import { RUNNERS } from './runners'
import { CreditError, redeemCredits, returnCredits, Serial, type CreditDeps, type VerifyLineage } from './redeem'
import { JOB_KINDS, MAX_JOB_MINUTES, type Job, type JobKind, type JobPayment, type JobRunner } from './runner'

export interface ProviderAppOptions {
  /** provider-api server wallet: receives 402 payments (not the operator's Desktop wallet). */
  wallet: WalletInterface
  products: Product[]
  runner: JobRunner
  /** Coordinator side API (MASTER §3.5) for open pools in the catalog. */
  coopApiUrl?: string
  /** Required when more than one process serves the paid routes. */
  replayStore?: PaymentReplayStore
  /** Prepaid credit balances. Default: in memory. */
  ledger?: CreditLedger
  /** Overlay for credit tokens; redeem/return answer 503 without it. */
  overlay?: OverlayClient
  /** Override Track A's verifyLineage (tests). */
  verifyLineage?: VerifyLineage
  /** Access-Control-Allow-Origin for browser clients (the web app). Default '*'. */
  corsOrigin?: string
  /** Ancestor source for verifyLineage beyond the posted BEEF (tests: the mock chain). Default Arcade. */
  fetchTx?: TxFetcher
  arcadeUrl?: string
}

export interface JobQuote {
  product: Product
  kind: JobKind
  /** Quantity in the product runner's unit (GPU minutes, proxy MB). */
  units: number
  /** Retail price in sats, used when the prepaid balance does not cover `units`. */
  retailSats: number
}

/**
 * Validates a POST /v1/jobs body: `{ product?, kind, minutes }` for GPU
 * products, `{ product, kind, mb }` for proxy products (runners.ts). The price
 * comes from here, never from the request.
 */
export function quoteJob (body: unknown, products: Product[]): JobQuote | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>
  const product = b.product === undefined ? defaultProduct(products) : products.find(p => p.id === b.product)
  if (product === undefined) return { error: `unknown product ${String(b.product)}` }
  const spec = RUNNERS[runnerIdOf(product)]
  if (typeof b.kind !== 'string' || !spec.kinds.includes(b.kind)) return { error: `kind must be one of ${spec.kinds.join(', ')} for ${product.id}` }
  const units = b[spec.quantityField]
  if (typeof units !== 'number' || !Number.isSafeInteger(units) || units < 1 || units > spec.maxQuantity) {
    return { error: `${spec.quantityField} must be an integer from 1 to ${spec.maxQuantity} for ${product.id}` }
  }
  return { product, kind: b.kind, units, retailSats: retailSatsFor(product, units) }
}

/** BRC-103/104 auth and BRC-105 payment headers (CORS needs exact names, no wildcards). */
export const AUTH_HEADERS = [
  'x-bsv-auth-version', 'x-bsv-auth-identity-key', 'x-bsv-auth-nonce', 'x-bsv-auth-your-nonce', 'x-bsv-auth-signature',
  'x-bsv-auth-message-type', 'x-bsv-auth-request-id', 'x-bsv-auth-requested-certificates'
]
export const PAYMENT_HEADERS = ['x-bsv-payment-version', 'x-bsv-payment-satoshis-required', 'x-bsv-payment-derivation-prefix', 'x-bsv-payment-satoshis-paid']

const isJobRequest = (req: PaymentRequest): boolean => req.method === 'POST' && req.path === '/v1/jobs'
const identityOf = (req: PaymentRequest): string => String(req.auth?.identityKey)

export function publicJob (job: Job): Job {
  return { ...job, log: [...job.log] }
}

export async function fetchPools (coopApiUrl: string | undefined, products: Product[]): Promise<{ pools: unknown[], source: string }> {
  if (coopApiUrl === undefined || coopApiUrl === '') return { pools: [], source: 'not configured' }
  const tokenIds = new Set(products.map(p => p.tokenId).filter(t => t !== null))
  try {
    const res = await fetch(`${coopApiUrl}/pools`, { signal: AbortSignal.timeout(2000) })
    if (!res.ok) return { pools: [], source: `coordinator answered ${res.status}` }
    const body = await res.json() as unknown
    const list = (Array.isArray(body) ? body : (body as { pools?: unknown[] }).pools ?? []) as Array<{ terms?: { tokenId?: string }, tokenId?: string }>
    return { pools: list.filter(p => tokenIds.has(p.terms?.tokenId ?? p.tokenId ?? '')), source: coopApiUrl }
  } catch {
    return { pools: [], source: 'coordinator unreachable' }
  }
}

export function createProviderApp (opts: ProviderAppOptions): Express {
  const { wallet, products, runner } = opts
  const ledger = opts.ledger ?? new CreditLedger()
  const credits: CreditDeps | undefined = opts.overlay === undefined
    ? undefined
    : { wallet, kit: new TokenKit(wallet, opts.overlay), overlay: opts.overlay, ledger, products, verifyLineage: opts.verifyLineage, fetchTx: opts.fetchTx, arcadeUrl: opts.arcadeUrl }
  const tokenOps = new Serial()
  /** Jobs whose price was covered by prepaid credits (set by the price function). */
  const paidWithCredits = new WeakMap<object, { units: number, tokenId: string }>()
  const app = express()
  // CORS for the web app (MASTER §3.10): browsers may call with AuthFetch and must read the BRC-103/105 headers.
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', opts.corsOrigin ?? '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', ['Content-Type', ...AUTH_HEADERS, 'x-bsv-payment'].join(', '))
    res.setHeader('Access-Control-Expose-Headers', [...AUTH_HEADERS, ...PAYMENT_HEADERS].join(', '))
    if (req.method === 'OPTIONS') { res.status(204).end(); return }
    next()
  })
  app.use(express.json())

  // Unauthenticated liveness probe, before the auth middleware.
  app.get('/healthz', (_req, res) => { res.json({ ok: true }) })

  app.use(createAuthMiddleware({ wallet }))
  app.use(createPaymentMiddleware({
    wallet,
    replayStore: opts.replayStore,
    calculateRequestPrice: (req: PaymentRequest): number => {
      if (!isJobRequest(req)) return 0
      const quote = quoteJob(req.body, products)
      if ('error' in quote) return 0 // the route answers 400; nothing to pay for
      const tokenId = quote.product.tokenId
      if (tokenId !== null && ledger.tryDebit(identityOf(req), tokenId, quote.units)) {
        paidWithCredits.set(req, { units: quote.units, tokenId })
        return 0
      }
      return quote.retailSats
    }
  }))

  app.get('/v1/catalog', async (_req, res) => {
    const { publicKey: server } = await wallet.getPublicKey({ identityKey: true })
    const { pools, source } = await fetchPools(opts.coopApiUrl, products)
    res.json({
      provider: { name: 'AgentCoop simulated provider (GPU + proxy)', server },
      products: products.map(p => {
        const spec = RUNNERS[runnerIdOf(p)]
        return {
          id: p.id, label: p.label, unit: p.unit, retailSatsPerCredit: p.retailSatsPerCredit,
          ...(spec.id === 'gpu' ? { minutesPerCredit: unitsPerCredit(p) } : {}),
          tokenId: p.tokenId, demoPricing: p.demoPricing === true,
          runner: spec.id, kinds: spec.kinds, quantityField: spec.quantityField, unitsPerCredit: unitsPerCredit(p)
        }
      }),
      pricingNote: products.some(p => p.demoPricing === true)
        ? 'demo pricing: retail and pool prices are illustrative; a pool discount shows the mechanism, not a proven saving (FINAL-IDEA §9)'
        : undefined,
      jobKinds: JOB_KINDS,
      maxJobMinutes: MAX_JOB_MINUTES,
      credits: { maxRedeem: MAX_REDEEM_CREDITS, maxPending: MAX_PENDING_REDEEM_CREDITS, redeemTo: server },
      pools,
      poolsSource: source
    })
  })

  app.post('/v1/jobs', (req: PaymentRequest, res: Response) => {
    const quote = quoteJob(req.body, products)
    if ('error' in quote) { res.status(400).json({ status: 'error', code: 'ERR_BAD_JOB', description: quote.error }); return }
    const covered = paidWithCredits.get(req)
    const receipt = req.payment
    let payment: JobPayment
    if (covered !== undefined) payment = { method: 'credits', ...covered, ...(runnerIdOf(quote.product) === 'gpu' ? { minutes: covered.units } : {}) }
    else if (receipt !== undefined && receipt.satoshisPaid > 0) payment = { method: 'sats', satoshis: receipt.satoshisPaid, txid: receipt.txid }
    else {
      res.status(500).json({ status: 'error', code: 'ERR_PAYMENT_INTERNAL', description: 'job reached the route without payment' })
      return
    }
    let job: Job
    try {
      job = runner.submit({ owner: identityOf(req), product: quote.product.id, kind: quote.kind, units: quote.units, payment })
    } catch (e) {
      if (covered !== undefined) ledger.refund(identityOf(req), covered.tokenId, covered.units)
      res.status(503).json({ status: 'error', code: 'ERR_RUNNER', description: (e as Error).message })
      return
    }
    res.status(202).json({ jobId: job.id, status: job.status, payment: job.payment })
  })

  // My orders (BL-30): the caller's own jobs and how each was paid, newest first. Free; nobody else's jobs.
  app.get('/v1/jobs', (req: PaymentRequest, res: Response) => {
    const raw = req.query.limit
    const limit = raw === undefined ? 50 : Number(raw)
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) { res.status(400).json({ status: 'error', code: 'ERR_BAD_REQUEST', description: 'limit must be 1..200' }); return }
    const mine = runner.list(identityOf(req)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    res.json({ jobs: mine.slice(0, limit).map(publicJob), total: mine.length })
  })

  app.get('/v1/jobs/:id', (req: PaymentRequest, res: Response) => {
    const job = runner.get(String(req.params.id))
    // Jobs are private to the identity that paid for them.
    if (job === undefined || job.owner !== identityOf(req)) { res.status(404).json({ status: 'error', code: 'ERR_NOT_FOUND', description: 'no such job' }); return }
    res.json(publicJob(job))
  })

  const creditRoute = (fn: (deps: CreditDeps, caller: string, body: unknown) => Promise<unknown>) =>
    async (req: PaymentRequest, res: Response): Promise<void> => {
      if (credits === undefined) { res.status(503).json({ status: 'error', code: 'ERR_NO_OVERLAY', description: 'credits are not configured on this provider' }); return }
      try {
        res.json(await tokenOps.run(async () => await fn(credits, identityOf(req), req.body)))
      } catch (e) {
        if (e instanceof CreditError) { res.status(e.status).json({ status: 'error', code: e.code, description: e.message }); return }
        res.status(500).json({ status: 'error', code: 'ERR_INTERNAL', description: (e as Error).message })
      }
    }

  app.post('/v1/credits/redeem', creditRoute(redeemCredits))
  app.post('/v1/credits/return', creditRoute(returnCredits))

  app.get('/v1/credits/balance', (req: PaymentRequest, res: Response) => {
    const me = identityOf(req)
    res.json({
      identity: me,
      balances: products.filter(p => p.tokenId !== null).map(p => {
        const prepaidUnits = ledger.balance(me, p.tokenId!)
        const gpu = runnerIdOf(p) === 'gpu'
        return {
          product: p.id, tokenId: p.tokenId, unit: RUNNERS[runnerIdOf(p)].quantityField, unitsPerCredit: unitsPerCredit(p), prepaidUnits,
          ...(gpu ? { minutesPerCredit: unitsPerCredit(p), prepaidMinutes: prepaidUnits } : {}),
          returnableCredits: Math.floor(prepaidUnits / unitsPerCredit(p))
        }
      }),
      limits: { maxRedeem: MAX_REDEEM_CREDITS, maxPending: MAX_PENDING_REDEEM_CREDITS }
    })
  })

  return app
}
