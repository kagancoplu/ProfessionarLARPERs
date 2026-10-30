/**
 * Participant / guard side of lock-in (track A 1.5, FINAL-IDEA §4.3 step 5):
 * check the WHOLE settlement before signing it ALL. Throws AgentCoopError.
 * Lineage of the offer's credits (verifyLineage) is wired in Faz 2.
 */
import { LockingScript, Transaction } from '../sdk'
import { decodeBsv21 } from '../kit/inscription'
import { AgentCoopError } from '../errors'
import { parseOpReturn } from '../scripts/opreturn'
import type { Offer, SettlementPlan } from '../types'
import { parseOutpoint } from '../util/outpoint'
import { inputScriptValid } from '../util/spend'
import { pledgeListHash } from './plan'
import { creditsCost, termsHash, validateTerms } from './terms'
import { verifyLineage, type LineageOptions } from '../verify/lineage'

export interface VerifyOptions {
  /** Credits I pledged. */
  expectedCredits: string
  /** HASH160 my credit output must pay (receivePkh(me, tokenIndex)); checked when given. */
  expectedCreditPkh?: string
  /** Most I accept to pay in fees (default 1,000 sats). */
  maxFeeSats?: number
  /** Verify the offer's credit lineage independently of the overlay (FINAL-IDEA §4.3 step 5). */
  verifyLineage?: boolean
  /** Fetcher / cache for verifyLineage (default: Arcade, then WhatsOnChain). */
  lineage?: LineageOptions
}

export const planTransaction = (plan: SettlementPlan): Transaction => Transaction.fromAtomicBEEF(plan.templateBEEF)

const txidOf = (tx: Transaction, i: number): string => tx.inputs[i].sourceTXID ?? tx.inputs[i].sourceTransaction!.id('hex')

export async function verifySettlementPlan (plan: SettlementPlan, offer: Offer, myOutpoint: string, opts: VerifyOptions): Promise<void> {
  const bad = (msg: string): never => { throw new AgentCoopError('BAD_PLAN', msg) }
  const t = offer.terms
  validateTerms(t)
  if (plan.poolId !== t.poolId || offer.poolId !== t.poolId) bad('pool id mismatch')
  const tx = planTransaction(plan)
  const n = plan.participants.length
  if (n === 0) bad('no participants')
  if (tx.inputs.length !== n + 1) bad(`expected ${n + 1} inputs, got ${tx.inputs.length}`)
  if (tx.outputs.length !== 2 * n + 2) bad(`expected ${2 * n + 2} outputs, got ${tx.outputs.length}`)

  // Offer: input 0 is the offer UTXO, signed, and output 0 pays the provider exactly.
  const offerOp = parseOutpoint(offer.poolId)
  if (txidOf(tx, 0) !== offerOp.txid || tx.inputs[0].sourceOutputIndex !== offerOp.vout) bad('input 0 is not the offer')
  if (tx.inputs[0].unlockingScript?.toHex() !== offer.unlockingScriptHex) bad('input 0 does not carry the offer signature')
  if (!inputScriptValid(tx, 0)) bad('offer signature does not verify against this transaction')
  if (tx.outputs[0].lockingScript.toHex() !== t.payScriptHex || tx.outputs[0].satoshis !== Number(t.priceSats)) bad('output 0 is not the provider payment')
  const offerSource = tx.inputs[0].sourceTransaction!.outputs[offerOp.vout]
  const offerCredits = decodeBsv21(offerSource.lockingScript)
  if (offerCredits === null || offerCredits.amount !== BigInt(t.credits)) bad('offer input does not carry N credits')

  // Every participant: input j+1 ↔ credit output j+1 ↔ change output n+1+j.
  let total = 0n
  let mine = -1
  for (let j = 0; j < n; j++) {
    const p = plan.participants[j]
    const op = parseOutpoint(p.outpoint)
    const vin = j + 1
    if (txidOf(tx, vin) !== op.txid || tx.inputs[vin].sourceOutputIndex !== op.vout) bad(`input ${vin} is not ${p.outpoint}`)
    const credit = tx.outputs[vin]
    const d = decodeBsv21(credit.lockingScript)
    if (d === null || d.op !== 'transfer' || d.id !== t.tokenId || d.amount !== BigInt(p.credits) || credit.satoshis !== 1) bad(`output ${vin} is not ${p.credits} credits`)
    total += BigInt(p.credits)
    const coin = tx.inputs[vin].sourceTransaction!.outputs[op.vout]
    const change = tx.outputs[n + 1 + j]
    if (change.lockingScript.toHex() !== coin.lockingScript.toHex()) bad(`change ${n + 1 + j} does not return to the pledge coin's script`)
    if (String(change.satoshis) !== p.changeSats || change.satoshis! < 1) bad(`change ${n + 1 + j} ≠ plan`)
    if (p.outpoint === myOutpoint) {
      mine = j
      if (p.credits !== opts.expectedCredits) bad(`my credits are ${p.credits}, expected ${opts.expectedCredits}`)
      if (opts.expectedCreditPkh !== undefined && d!.ownerPkh !== opts.expectedCreditPkh) bad('my credit output pays someone else')
      const cost = coin.satoshis! - change.satoshis!
      const maxCost = Number(creditsCost(t, p.credits)) + 1 + (opts.maxFeeSats ?? 1000)
      if (cost > maxCost) bad(`I would pay ${cost} sats, at most ${maxCost} accepted`)
    }
  }
  if (mine === -1) bad(`my pledge ${myOutpoint} is not in the plan`)
  if (total !== BigInt(t.credits)) bad(`credits sum to ${total}, expected ${t.credits}`)
  if (new Set(plan.participants.map(p => p.outpoint)).size !== n) bad('duplicate pledge')

  // OP_RETURN settle commits to these terms and exactly this pledge list.
  const settle = parseOpReturn(tx.outputs[2 * n + 1].lockingScript as LockingScript)
  if (settle?.op !== 'settle') bad('last output is not an agentcoop settle record')
  const listHash = pledgeListHash(plan.participants.map(p => p.outpoint))
  if (listHash !== plan.pledgeListHash || settle!.json.pledgeListHash !== listHash) bad('pledge-list hash mismatch')
  if (settle!.json.poolId !== t.poolId || settle!.json.termsHash !== termsHash(t) || settle!.json.round !== String(plan.round)) bad('settle record does not match the pool')

  // The offer's credits are genuine: walk them back to the deploy ourselves (no overlay trust).
  if (opts.verifyLineage === true) {
    const r = await verifyLineage(offer.poolId, opts.lineage)
    if (!r.ok) throw new AgentCoopError('LINEAGE_FAILED', r.reason ?? 'offer credits are not genuine')
    if (r.tokenId !== t.tokenId || r.amt !== BigInt(t.credits)) throw new AgentCoopError('LINEAGE_FAILED', `offer carries ${String(r.amt)} of ${String(r.tokenId)}`)
  }
}
