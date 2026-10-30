/**
 * The provider's offer, published on chain (Track B 6.1, MASTER §3.2 `offer`).
 * Added by Track B; additive only.
 *
 * Without it the offer lives only in the coordinator that received
 * `POST /offers`, so a second coordinator depends on the first. The offer
 * signature spends the pool's own credit output, so it cannot sit in the pool
 * transaction; a small extra transaction carries it:
 *
 *   OP_FALSE OP_RETURN "agentcoop" "offer" {"v":"1","poolId","unlockingScriptHex"}
 *
 * Terms, locking script and satoshis are already on chain (the pool record and
 * the pool tx's output 0), so the record carries only the signature. Anyone can
 * publish one; whoever reads it checks it with `verifyOffer` against the pool
 * tx, so a bogus record costs its publisher a fee and nothing else.
 */
import type { Transaction, WalletInterface } from '../sdk'
import { AgentCoopError } from '../errors'
import { buildOpReturn } from '../scripts/opreturn'
import type { Offer, PoolTerms } from '../types'
import { parseOutpoint } from '../util/outpoint'

export interface OfferRecord { v: '1', poolId: string, unlockingScriptHex: string }

export const offerRecordOf = (offer: Offer): OfferRecord => ({ v: '1', poolId: offer.poolId, unlockingScriptHex: offer.unlockingScriptHex })

/** Rebuild the full Offer from an on-chain record, the pool's terms and its transaction. Check it with `verifyOffer` before use. */
export function offerFromRecord (record: OfferRecord, terms: PoolTerms, poolTx: Transaction): Offer {
  const { txid, vout } = parseOutpoint(record.poolId)
  if (terms.poolId !== record.poolId || poolTx.id('hex') !== txid) throw new AgentCoopError('BAD_OFFER', 'record, terms and pool tx disagree on the pool')
  const out = poolTx.outputs[vout]
  if (out === undefined) throw new AgentCoopError('BAD_OFFER', 'poolId output does not exist')
  return { poolId: record.poolId, unlockingScriptHex: record.unlockingScriptHex, lockingScriptHex: out.lockingScript.toHex(), satoshis: out.satoshis!, terms }
}

/** Write the offer on chain: one 0-sat OP_RETURN output, funded by the wallet. Submit `beef` to tm_agentcoop. */
export async function publishOffer (wallet: WalletInterface, offer: Offer, originator?: string): Promise<{ txid: string, beef: number[] }> {
  const res = await wallet.createAction({
    description: 'AgentCoop: publish pool offer',
    labels: ['agentcoop'],
    outputs: [{ lockingScript: buildOpReturn('offer', offerRecordOf(offer)).toHex(), satoshis: 0, outputDescription: 'AgentCoop offer record' }],
    options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
  }, originator)
  if (res.txid === undefined || res.tx === undefined) throw new Error('wallet did not return the offer transaction')
  return { txid: res.txid, beef: Array.from(res.tx) }
}
