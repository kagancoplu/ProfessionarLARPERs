/**
 * Where a coordinator gets a pool's offer (B.P6b, Faz 6.1): its own store
 * (`POST /offers`), else the offer the provider published on chain
 * (`OP_RETURN agentcoop offer`, overlay `{ op: 'offers', poolId }`). A chain
 * offer is checked exactly like a posted one (verifyOffer.ts) before it is
 * stored, so any coordinator can close any pool without the first one.
 */
import { offerFromRecord, type Offer, type OfferRecord, type PoolTerms } from '@agentcoop/core'
import type { PoolView } from '../../../packages/overlay/src/views'
import type { OverlayLookup } from './overlay'
import type { CoordinatorStore } from './store'
import { verifyOffer } from './verifyOffer'

/** The PoolTerms keys; the on-chain pool record also carries the provider's nonce, which the signed terms do not. */
const POOL_TERMS_KEYS = ['v', 'poolId', 'provider', 'providerApi', 'tokenId', 'credits', 'priceSats', 'payScriptHex', 'feeSats', 'minCredits', 'deadlineHeight', 'backstopMax', 'label', 'retailSatsPerCredit'] as const

export const termsOf = (view: PoolView): PoolTerms =>
  Object.fromEntries(POOL_TERMS_KEYS.filter(k => view.terms[k] !== undefined).map(k => [k, view.terms[k]])) as unknown as PoolTerms

export class OfferSource {
  /** poolId → time of the last chain miss (no valid published offer) */
  private readonly misses = new Map<string, number>()

  constructor (private readonly overlay: OverlayLookup, private readonly store: CoordinatorStore, private readonly retryMs = 15_000) {}

  /**
   * The stored offer, or a valid published one (then stored). `pool` saves a lookup when the caller has it.
   * `requireOpen: false` (audit) also accepts the published offer of a pool that already settled.
   */
  async find (poolId: string, pool?: PoolView, opts: { requireOpen?: boolean } = {}): Promise<Offer | undefined> {
    const stored = await this.store.getOffer(poolId)
    if (stored !== undefined) return stored
    const miss = this.misses.get(poolId)
    if (opts.requireOpen !== false && miss !== undefined && Date.now() - miss < this.retryMs) return undefined
    const offer = await this.fromChain(poolId, pool, opts.requireOpen !== false)
    if (offer === undefined) { this.misses.set(poolId, Date.now()); return undefined }
    this.misses.delete(poolId)
    await this.store.saveOffer(offer)
    return offer
  }

  /** A new offer record reached the overlay: look again on the next call. */
  forget (poolId?: string): void {
    if (poolId === undefined) this.misses.clear()
    else this.misses.delete(poolId)
  }

  private async fromChain (poolId: string, pool: PoolView | undefined, requireOpen: boolean): Promise<Offer | undefined> {
    const records = await this.overlay.offers(poolId)
    if (records.length === 0) return undefined
    const [view, credit] = await Promise.all([pool ?? this.overlay.pool(poolId), this.overlay.creditOutput(poolId)])
    if (view === undefined || credit === undefined) return undefined
    for (const r of records) {
      try {
        return verifyOffer(offerFromRecord(r, termsOf(view), credit.tx), view, credit, credit.tx, { requireOpen })
      } catch {
        // someone else's bogus record, or a stale one: try the next
      }
    }
    return undefined
  }
}

export type { OfferRecord }
