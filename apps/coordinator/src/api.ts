/**
 * Side API (MASTER §3.5): offers, pools, pledges. Pool data comes from the
 * overlay (chain records); the API only adds what the chain cannot say:
 * `failed` (deadline passed, from the block height), `locking` (a signing
 * round is running, Faz 2) and `hasOffer`.
 */
import express, { type Router } from 'express'
import type { Listing, Offer } from '@agentcoop/core'
import type { PoolView } from '../../../packages/overlay/src/views'
import type { HeightSource } from './chain'
import type { CoordinatorStatus } from './engine'
import { OverlayUnavailableError, type OverlayLookup } from './overlay'
import type { CoordinatorStore } from './store'
import { OfferError, verifyOffer } from './verifyOffer'
import { normalizeOutpoint, verifyListing } from './verifyListing'
import { auditPool } from './audit'
import { computeMetrics, toProm, type Metrics } from './metrics'

export type ApiPoolStatus = PoolView['status'] | 'failed' | 'locking'
export type ApiPool = Omit<PoolView, 'status'> & { status: ApiPoolStatus, hasOffer: boolean, height?: number, heightUnknown?: true, coordinator?: CoordinatorStatus }

export interface ApiDeps {
  overlay: OverlayLookup
  store: CoordinatorStore
  height: HeightSource
  /** Pools with a signing round in progress (Faz 2 engine). */
  locking: () => ReadonlySet<string>
  /** WS clients (healthz). */
  feedCounts?: () => { clients: number, proven: number }
  /** Round state for a pool, when the engine runs. */
  coordinatorStatus?: (poolId: string) => CoordinatorStatus | undefined
}

const POOL_ID_RE = /^[0-9a-f]{64}_\d+$/

/** Overlay view + derived status. Shared by the HTTP API and the WS feed. */
export async function derivePools (deps: ApiDeps, views: PoolView[]): Promise<ApiPool[]> {
  const [height, offers] = await Promise.all([deps.height.height(), deps.store.offerPoolIds()])
  const locking = deps.locking()
  return views.map(v => {
    let status: ApiPoolStatus = v.status
    if (v.status === 'open' && locking.has(v.poolId)) status = 'locking'
    else if (v.status === 'open' && height !== undefined && height >= Number(v.terms.deadlineHeight)) status = 'failed'
    const coordinator = deps.coordinatorStatus?.(v.poolId)
    return {
      ...v,
      status,
      hasOffer: offers.has(v.poolId),
      ...(height !== undefined ? { height } : { heightUnknown: true as const }),
      ...(coordinator !== undefined ? { coordinator } : {})
    }
  })
}

export function createApiRouter (deps: ApiDeps): Router {
  const r = express.Router()
  r.use(express.json({ limit: '1mb' }))

  const wrap = (fn: (req: express.Request, res: express.Response) => Promise<void>) =>
    (req: express.Request, res: express.Response): void => {
      fn(req, res).catch(e => {
        if (e instanceof OfferError) res.status(e.status).json({ code: e.code, error: e.message })
        else if (e instanceof OverlayUnavailableError) res.status(502).json({ code: 'OVERLAY_UNAVAILABLE', error: e.message })
        else res.status(500).json({ code: 'INTERNAL', error: String((e as Error).message ?? e) })
      })
    }
  const poolIdParam = (req: express.Request): string => {
    const id = String(req.params.poolId)
    if (!POOL_ID_RE.test(id)) throw new OfferError('BAD_POOL_ID', 'poolId must be "<txid>_<vout>"')
    return id
  }

  r.post('/offers', wrap(async (req, res) => {
    const offer = req.body as Offer
    const poolId = typeof offer?.poolId === 'string' && POOL_ID_RE.test(offer.poolId) ? offer.poolId : undefined
    if (poolId === undefined) throw new OfferError('OFFER_INVALID_FORMAT', 'offer.poolId must be "<txid>_<vout>"')
    const [pool, credit] = await Promise.all([deps.overlay.pool(poolId), deps.overlay.creditOutput(poolId)])
    const verified = verifyOffer(offer, pool, credit, credit?.tx)
    await deps.store.saveOffer(verified)
    res.status(201).json({ poolId, accepted: true })
  }))

  r.get('/offers/:poolId', wrap(async (req, res) => {
    const offer = await deps.store.getOffer(poolIdParam(req))
    if (offer === undefined) { res.status(404).json({ code: 'OFFER_NOT_FOUND', error: 'no offer for this pool' }); return }
    res.json(offer)
  }))

  r.get('/pools', wrap(async (_req, res) => {
    res.json(await derivePools(deps, await deps.overlay.pools()))
  }))

  r.get('/pools/:poolId', wrap(async (req, res) => {
    const view = await deps.overlay.pool(poolIdParam(req))
    if (view === undefined) { res.status(404).json({ code: 'POOL_NOT_FOUND', error: 'pool is not on the overlay' }); return }
    res.json((await derivePools(deps, [view]))[0])
  }))

  r.get('/pools/:poolId/pledges', wrap(async (req, res) => {
    const all = req.query.all === '1'
    res.json(await deps.overlay.pledges(poolIdParam(req), { includeSpent: all, includeInvalid: all }))
  }))

  r.post('/listings', wrap(async (req, res) => {
    const listing = req.body as Listing
    const outpoint = typeof listing?.outpoint === 'string' ? normalizeOutpoint(listing.outpoint) : ''
    const credit = /^[0-9a-f]{64}_\d+$/.test(outpoint) ? await deps.overlay.tokenOutput(outpoint) : undefined
    const verified = verifyListing(listing, credit)
    await deps.store.saveListing(verified)
    res.status(201).json({ outpoint: verified.outpoint, accepted: true })
  }))

  /** Unspent listings, cheapest per credit first; spent ones (swept or cancelled) are dropped. */
  r.get('/listings', wrap(async (req, res) => {
    const tokenId = typeof req.query.tokenId === 'string' ? req.query.tokenId : undefined
    const live: Listing[] = []
    for (const l of await deps.store.listings(tokenId)) {
      const credit = await deps.overlay.tokenOutput(l.outpoint)
      if (credit === undefined || credit.spent) { await deps.store.deleteListing(l.outpoint); continue }
      live.push(l)
    }
    live.sort((a, b) => {
      const x = BigInt(a.askSats) * BigInt(b.credits)
      const y = BigInt(b.askSats) * BigInt(a.credits)
      return x < y ? -1 : x > y ? 1 : 0
    })
    res.json(live)
  }))

  r.get('/pools/:poolId/audit', wrap(async (req, res) => {
    res.json(await auditPool(deps, poolIdParam(req)))
  }))

  let metricsCache: { at: number, value: Metrics } | undefined
  r.get('/metrics', wrap(async (req, res) => {
    if (metricsCache === undefined || Date.now() - metricsCache.at > 10_000) metricsCache = { at: Date.now(), value: await computeMetrics(deps) }
    if (req.query.format === 'prom') res.type('text/plain; version=0.0.4').send(toProm(metricsCache.value))
    else res.json(metricsCache.value)
  }))

  const startedAt = Date.now()
  r.get('/healthz', wrap(async (_req, res) => {
    let overlay = true
    let openPools: number | null = null
    try { openPools = (await deps.overlay.pools()).filter(p => p.status === 'open').length } catch { overlay = false }
    const height = await deps.height.height()
    res.status(overlay ? 200 : 503).json({
      ok: overlay,
      overlay,
      height: height ?? null,
      arcade: height !== undefined,
      engine: deps.coordinatorStatus !== undefined,
      openPools,
      ws: deps.feedCounts?.() ?? null,
      uptimeS: Math.round((Date.now() - startedAt) / 1000)
    })
  }))

  return r
}
