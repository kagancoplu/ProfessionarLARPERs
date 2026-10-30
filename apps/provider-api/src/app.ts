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
import { minutesPerCredit, retailSatsFor, type Product } from './products'
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
  /** Ancestor source for verifyLineage beyond the posted BEEF (tests: the mock chain). Default Arcade. */
  fetchTx?: TxFetcher
  arcadeUrl?: string
}

export interface JobQuote {
  product: Product
  kind: JobKind
  minutes: number
  /** Retail price in sats, used when the prepaid balance does not cover `minutes`. */
  retailSats: number
}

/** Validates a POST /v1/jobs body. The price comes from here, never from the request. */
export function quoteJob (body: unknown, products: Product[]): JobQuote | { error: string } {
  const b = (body ?? {}) as { product?: unknown, kind?: unknown, minutes?: unknown }
  const product = b.product === undefined ? products[0] : products.find(p => p.id === b.product)
  if (product === undefined) return { error: `unknown product ${String(b.product)}` }
  if (typeof b.kind !== 'string' || !(JOB_KINDS as readonly string[]).includes(b.kind)) return { error: `kind must be one of ${JOB_KINDS.join(', ')}` }
  const minutes = b.minutes
  if (typeof minutes !== 'number' || !Number.isSafeInteger(minutes) || minutes < 1 || minutes > MAX_JOB_MINUTES) {
    return { error: `minutes must be an integer from 1 to ${MAX_JOB_MINUTES}` }
  }
  return { product, kind: b.kind as JobKind, minutes, retailSats: retailSatsFor(product, minutes) }
}

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
  const paidWithCredits = new WeakMap<object, { minutes: number, tokenId: string }>()
  const app = express()
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
      if (tokenId !== null && ledger.tryDebit(identityOf(req), tokenId, quote.minutes)) {
        paidWithCredits.set(req, { minutes: quote.minutes, tokenId })
        return 0
      }
      return quote.retailSats
    }
  }))

  app.get('/v1/catalog', async (_req, res) => {
    const { publicKey: server } = await wallet.getPublicKey({ identityKey: true })
    const { pools, source } = await fetchPools(opts.coopApiUrl, products)
    res.json({
      provider: { name: 'AgentCoop simulated GPU provider', server },
      products: products.map(p => ({
        id: p.id, label: p.label, unit: p.unit, retailSatsPerCredit: p.retailSatsPerCredit, minutesPerCredit: minutesPerCredit(p), tokenId: p.tokenId, demoPricing: p.demoPricing === true
      })),
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
    if (covered !== undefined) payment = { method: 'credits', ...covered }
    else if (receipt !== undefined && receipt.satoshisPaid > 0) payment = { method: 'sats', satoshis: receipt.satoshisPaid, txid: receipt.txid }
    else {
      res.status(500).json({ status: 'error', code: 'ERR_PAYMENT_INTERNAL', description: 'job reached the route without payment' })
      return
    }
    let job: Job
    try {
      job = runner.submit({ owner: identityOf(req), product: quote.product.id, kind: quote.kind, minutes: quote.minutes, payment })
    } catch (e) {
      if (covered !== undefined) ledger.refund(identityOf(req), covered.tokenId, covered.minutes)
      res.status(503).json({ status: 'error', code: 'ERR_RUNNER', description: (e as Error).message })
      return
    }
    res.status(202).json({ jobId: job.id, status: job.status, payment: job.payment })
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
        const prepaidMinutes = ledger.balance(me, p.tokenId!)
        return { product: p.id, tokenId: p.tokenId, minutesPerCredit: minutesPerCredit(p), prepaidMinutes, returnableCredits: Math.floor(prepaidMinutes / minutesPerCredit(p)) }
      }),
      limits: { maxRedeem: MAX_REDEEM_CREDITS, maxPending: MAX_PENDING_REDEEM_CREDITS }
    })
  })

  return app
}
