/**
 * GEÇİCİ (Track B, Faz 1): Track A's `verifyOffer` (A.P1.2) until
 * @agentcoop/core exists. Checks that an Offer really is the provider's
 * SIGHASH_SINGLE|ANYONECANPAY|FORKID signature over the pool's credit UTXO,
 * paying `priceSats` to `payScriptHex` at output 0 (FINAL-IDEA §4.3 step 1).
 */
import { LockingScript, Spend, Transaction, TransactionSignature, UnlockingScript } from '@bsv/sdk'
import type { Offer } from '../../../packages/overlay/src/stub/types'
import type { PoolView } from '../../../packages/overlay/src/views'

export const OFFER_SCOPE = TransactionSignature.SIGHASH_SINGLE | TransactionSignature.SIGHASH_ANYONECANPAY | TransactionSignature.SIGHASH_FORKID

export class OfferError extends Error {
  constructor (readonly code: string, message: string, readonly status = 400) { super(message) }
}

const TERM_KEYS = ['provider', 'providerApi', 'tokenId', 'credits', 'priceSats', 'payScriptHex', 'feeSats', 'minCredits', 'deadlineHeight', 'label', 'retailSatsPerCredit'] as const

/**
 * Throws OfferError; returns the offer with `terms` replaced by the overlay's
 * (the chain record is authoritative, the posted copy only has to agree).
 */
export function verifyOffer (offer: Offer, pool: PoolView | undefined, credit: { lockingScriptHex: string, satoshis: number, spent: boolean } | undefined): Offer {
  if (offer === null || typeof offer !== 'object' || typeof offer.poolId !== 'string' || typeof offer.unlockingScriptHex !== 'string' ||
      typeof offer.lockingScriptHex !== 'string' || typeof offer.satoshis !== 'number' || typeof offer.terms !== 'object' || offer.terms === null) {
    throw new OfferError('OFFER_INVALID_FORMAT', 'offer needs poolId, unlockingScriptHex, lockingScriptHex, satoshis, terms')
  }
  if (pool === undefined) throw new OfferError('POOL_NOT_FOUND', `pool ${offer.poolId} is not on the overlay`, 404)
  if (pool.invalidReason !== undefined) throw new OfferError('POOL_INVALID', `pool record is invalid: ${pool.invalidReason}`)
  if (pool.status !== 'open') throw new OfferError('POOL_NOT_OPEN', `pool is ${pool.status}`, 409)
  if (credit === undefined || credit.spent) throw new OfferError('POOL_NOT_OPEN', 'the pool credit UTXO is spent', 409)
  if (offer.lockingScriptHex !== credit.lockingScriptHex || offer.satoshis !== credit.satoshis) {
    throw new OfferError('CREDIT_MISMATCH', 'offer lockingScript/satoshis differ from the pool credit UTXO')
  }
  for (const k of TERM_KEYS) {
    if (offer.terms[k] !== pool.terms[k]) throw new OfferError('TERMS_MISMATCH', `offer terms.${k} differs from the on-chain pool record`)
  }

  let unlock: UnlockingScript
  try {
    unlock = UnlockingScript.fromHex(offer.unlockingScriptHex)
  } catch {
    throw new OfferError('SIGNATURE_INVALID', 'unlockingScriptHex does not parse')
  }
  const sig = unlock.chunks[0]?.data
  if (unlock.chunks.length !== 2 || sig === undefined || sig.length < 9) throw new OfferError('SIGNATURE_INVALID', 'expected <sig> <pubkey>')
  if (sig[sig.length - 1] !== OFFER_SCOPE) {
    throw new OfferError('SIGHASH_NOT_SINGLE_ACP', `offer must be signed SIGHASH_SINGLE|ANYONECANPAY|FORKID (0x${OFFER_SCOPE.toString(16)}), got 0x${sig[sig.length - 1].toString(16)}`)
  }

  // A one-input, one-output transaction is enough: SINGLE|ACP commits only to input 0 and output 0.
  const [txid, vout] = pool.poolId.split('_')
  const tx = new Transaction()
  tx.addInput({ sourceTXID: txid, sourceOutputIndex: Number(vout), unlockingScript: unlock, sequence: 0xffffffff })
  tx.addOutput({ lockingScript: LockingScript.fromHex(pool.terms.payScriptHex), satoshis: Number(pool.terms.priceSats) })
  let ok = false
  try {
    ok = new Spend({
      sourceTXID: txid,
      sourceOutputIndex: Number(vout),
      sourceSatoshis: credit.satoshis,
      lockingScript: LockingScript.fromHex(credit.lockingScriptHex),
      transactionVersion: tx.version,
      otherInputs: [],
      outputs: tx.outputs,
      unlockingScript: unlock,
      inputSequence: 0xffffffff,
      inputIndex: 0,
      lockTime: tx.lockTime
    }).validate()
  } catch {
    ok = false
  }
  if (!ok) throw new OfferError('SIGNATURE_INVALID', 'signature does not unlock the credit UTXO for output 0 = priceSats → payScriptHex')
  return { ...offer, terms: pool.terms }
}
