/**
 * POST /listings: the listed outpoint must be a credit output the overlay
 * admitted and has not seen spent; the seller's SINGLE|ACP signature and the
 * credits it carries are checked by Track A's `verifyListing`.
 */
import { AgentCoopError, verifyListing as coreVerifyListing, type Listing } from '@agentcoop/core'
import type { Transaction } from '@agentcoop/core/sdk'
import { OfferError } from './verifyOffer'

const OUTPOINT_RE = /^[0-9a-f]{64}[_.]\d+$/

/** "txid.vout" or "txid_vout" → "txid_vout" */
export const normalizeOutpoint = (o: string): string => o.replace('.', '_')

export interface CreditOutput { spent: boolean, tx: Transaction }

/** Throws OfferError (LISTING_* codes, or A's BAD_LISTING); returns the listing with a normalized outpoint. */
export function verifyListing (listing: Listing, credit: CreditOutput | undefined): Listing {
  if (listing === null || typeof listing !== 'object' || typeof listing.outpoint !== 'string' || !OUTPOINT_RE.test(listing.outpoint) ||
      typeof listing.askSats !== 'string' || !/^[1-9]\d{0,18}$/.test(listing.askSats) || typeof listing.unlockingScriptHex !== 'string') {
    throw new OfferError('LISTING_INVALID_FORMAT', 'listing needs outpoint, tokenId, credits, askSats, seller, unlockingScriptHex, lockingScriptHex, payScriptHex')
  }
  const normalized = { ...listing, outpoint: normalizeOutpoint(listing.outpoint) }
  if (credit === undefined) throw new OfferError('LISTING_NOT_ON_OVERLAY', `${normalized.outpoint} is not a credit output the overlay admitted`, 404)
  if (credit.spent) throw new OfferError('LISTING_SPENT', `${normalized.outpoint} is already spent`, 409)
  try {
    coreVerifyListing(normalized, { sourceTx: credit.tx })
  } catch (e) {
    if (e instanceof AgentCoopError) throw new OfferError(e.code, e.message)
    throw e
  }
  return normalized
}
