/**
 * POST /offers: is this the provider's pre-signed offer for an open pool?
 * The signature and credit checks are Track A's `verifyOffer` (SINGLE|ACP,
 * output 0 = priceSats → payScriptHex, N credits of tokenId); the coordinator
 * adds what only the chain view can say: the pool is on the overlay, valid,
 * open, its credit UTXO unspent, and the offer's terms equal the pool record.
 */
import { AgentCoopError, verifyOffer as coreVerifyOffer, type Offer } from '@agentcoop/core'
import type { Transaction } from '@agentcoop/core/sdk'
import type { PoolView } from '../../../packages/overlay/src/views'

export class OfferError extends Error {
  constructor (readonly code: string, message: string, readonly status = 400) { super(message) }
}

const TERM_KEYS = ['provider', 'providerApi', 'tokenId', 'credits', 'priceSats', 'payScriptHex', 'feeSats', 'minCredits', 'deadlineHeight', 'label', 'retailSatsPerCredit'] as const

/**
 * Throws OfferError. The stored offer is the one the provider signed (its terms feed the settlement's termsHash).
 * `requireOpen: false` (audit of a settled pool) keeps the signature and terms checks but not "open and unspent".
 */
export function verifyOffer (offer: Offer, pool: PoolView | undefined, credit: { spent: boolean } | undefined, poolTx: Transaction | undefined, opts: { requireOpen?: boolean } = {}): Offer {
  if (offer === null || typeof offer !== 'object' || typeof offer.poolId !== 'string' || typeof offer.terms !== 'object' || offer.terms === null) {
    throw new OfferError('OFFER_INVALID_FORMAT', 'offer needs poolId, unlockingScriptHex, lockingScriptHex, satoshis, terms')
  }
  if (pool === undefined || poolTx === undefined) throw new OfferError('POOL_NOT_FOUND', `pool ${offer.poolId} is not on the overlay`, 404)
  if (pool.invalidReason !== undefined) throw new OfferError('POOL_INVALID', `pool record is invalid: ${pool.invalidReason}`)
  if (opts.requireOpen !== false && (pool.status !== 'open' || credit === undefined || credit.spent)) throw new OfferError('POOL_NOT_OPEN', `pool is ${pool.status}`, 409)
  for (const k of TERM_KEYS) {
    if (offer.terms[k] !== pool.terms[k]) throw new OfferError('TERMS_MISMATCH', `offer terms.${k} differs from the on-chain pool record`)
  }
  try {
    coreVerifyOffer(offer, { sourceTx: poolTx })
  } catch (e) {
    if (e instanceof AgentCoopError) throw new OfferError(e.code, e.message)
    throw e
  }
  return offer
}
