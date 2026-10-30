/**
 * Track A builders that Track C calls, with the signatures frozen in
 * MASTER §3.4. TEMPORARY: they throw until A.P1/A.P2 replace this file.
 *
 * Callers catch `NotImplementedError` where a fallback exists (e.g. redeem
 * falls back to the overlay when `verifyLineage` is missing).
 */
import type { WalletInterface } from '@bsv/sdk'
import type { TokenKit } from './kit/token'
import type { Offer, PoolTerms } from './types'

export class NotImplementedError extends Error {
  constructor (readonly what: string) {
    super(`${what} is not implemented yet (Track A)`)
    this.name = 'NotImplementedError'
  }
}

/** A.P1: reserve N credits in one UTXO and announce the pool (OP_RETURN pool) in one tx. */
export async function buildReserveAndAnnounce (
  _wallet: WalletInterface, _kit: TokenKit, _terms: Omit<PoolTerms, 'poolId'>
): Promise<{ txid: string, poolId: string }> {
  throw new NotImplementedError('buildReserveAndAnnounce (A.P1)')
}

/** A.P1: sign the reserved credit UTXO with SIGHASH_SINGLE|ANYONECANPAY|FORKID. */
export async function signOffer (_wallet: WalletInterface, _outpoint: string, _terms: PoolTerms): Promise<Offer> {
  throw new NotImplementedError('signOffer (A.P1)')
}

/** A.P2: fetch the ancestors (Arcade/WoC) and apply the kit rules locally. */
export async function verifyLineage (
  _outpoint: string, _opts: { arcadeUrl?: string, wocUrl?: string }
): Promise<{ ok: boolean, tokenId: string, amt: string, ownerPkh: string }> {
  throw new NotImplementedError('verifyLineage (A.P2)')
}
