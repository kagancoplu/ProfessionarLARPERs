/**
 * GEÇİCİ (Track B, Faz 3): until Track A's market code (A.P2.3) has its own
 * check. A listing is the seller's SINGLE|ANYONECANPAY signature over one of
 * its credit outputs, asking `askSats` to `payScriptHex` (FINAL-IDEA §4.8).
 */
import type { Listing } from '../../../packages/overlay/src/stub/types'
import { checkSingleAcpSignature, OfferError } from './verifyOffer'

const OUTPOINT_RE = /^[0-9a-f]{64}[_.]\d+$/
const UINT_RE = /^[1-9]\d{0,18}$/

/** "txid.vout" or "txid_vout" → "txid_vout" */
export const normalizeOutpoint = (o: string): string => o.replace('.', '_')

export interface CreditOutput { lockingScriptHex: string, satoshis: number, spent: boolean, tokenId: string, amt: string }

/** Throws OfferError (LISTING_* codes plus the signature codes); returns the listing with a normalized outpoint. */
export function verifyListing (listing: Listing, credit: CreditOutput | undefined): Listing {
  if (listing === null || typeof listing !== 'object' || typeof listing.outpoint !== 'string' || !OUTPOINT_RE.test(listing.outpoint) ||
      typeof listing.tokenId !== 'string' || typeof listing.credits !== 'string' || !UINT_RE.test(listing.credits) ||
      typeof listing.askSats !== 'string' || !UINT_RE.test(listing.askSats) || typeof listing.seller !== 'string' ||
      typeof listing.unlockingScriptHex !== 'string' || typeof listing.lockingScriptHex !== 'string' || typeof listing.payScriptHex !== 'string') {
    throw new OfferError('LISTING_INVALID_FORMAT', 'listing needs outpoint, tokenId, credits, askSats (positive integer strings), seller, unlockingScriptHex, lockingScriptHex, payScriptHex')
  }
  const outpoint = normalizeOutpoint(listing.outpoint)
  if (credit === undefined) throw new OfferError('LISTING_NOT_ON_OVERLAY', `${outpoint} is not a credit output the overlay admitted`, 404)
  if (credit.spent) throw new OfferError('LISTING_SPENT', `${outpoint} is already spent`, 409)
  if (credit.tokenId !== listing.tokenId || credit.amt !== listing.credits) {
    throw new OfferError('LISTING_MISMATCH', `${outpoint} holds ${credit.amt} of ${credit.tokenId}, not ${listing.credits} of ${listing.tokenId}`)
  }
  if (credit.lockingScriptHex !== listing.lockingScriptHex || credit.satoshis !== 1) {
    throw new OfferError('CREDIT_MISMATCH', 'listing lockingScript differs from the credit output')
  }
  checkSingleAcpSignature(listing.unlockingScriptHex, outpoint, credit, listing.payScriptHex, Number(listing.askSats))
  return { ...listing, outpoint }
}
