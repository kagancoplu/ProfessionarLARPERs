/**
 * Participant / guard side of lock-in (track A 1.5, FINAL-IDEA §4.3 step 5):
 * check the WHOLE settlement before signing it ALL. Throws AgentCoopError.
 * Lineage of the offer's credits (verifyLineage) is wired in Faz 2.
 */
import { LockingScript, Transaction } from '../sdk'
import { decodeBsv21 } from '../kit/inscription'
import { AgentCoopError } from '../errors'
import { parseOpReturn } from '../scripts/opreturn'
import type { Offer, PledgeRecord, SettlementPlan } from '../types'
import { parseOutpoint } from '../util/outpoint'
import { inputScriptValid } from '../util/spend'
import { creditLockOf, pledgeListHash } from './plan'
import { decodeBsv21Owned } from '../scripts/creditLock'
import { isLighthouseRecord, lighthouseLockingScript } from '../scripts/lighthouse'
import { receivePkh } from '../kit/addresses'
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

/** The pledge record in a pledge transaction (its first `agentcoop pledge` OP_RETURN), or undefined. */
export function pledgeRecordOf (tx: Transaction): PledgeRecord | undefined {
  for (const o of tx.outputs) {
    const r = parseOpReturn(o.lockingScript as LockingScript)
    if (r?.op === 'pledge') return r.json as unknown as PledgeRecord
  }
  return undefined
}

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
  // Interactive participants first, lighthouse ones (A 5.5: exact coin, no change) after them.
  const interactive = plan.participants.findIndex(p => p.mode === 'lighthouse')
  const nI = interactive === -1 ? n : interactive
  if (plan.participants.slice(nI).some(p => p.mode !== 'lighthouse')) bad('lighthouse participants must come after the interactive ones')
  if (tx.outputs.length !== 1 + n + nI + 1) bad(`expected ${1 + n + nI + 1} outputs, got ${tx.outputs.length}`)

  // Offer: input 0 is the offer UTXO, signed, and output 0 pays the provider exactly.
  const offerOp = parseOutpoint(offer.poolId)
  if (txidOf(tx, 0) !== offerOp.txid || tx.inputs[0].sourceOutputIndex !== offerOp.vout) bad('input 0 is not the offer')
  if (tx.inputs[0].unlockingScript?.toHex() !== offer.unlockingScriptHex) bad('input 0 does not carry the offer signature')
  if (!inputScriptValid(tx, 0)) bad('offer signature does not verify against this transaction')
  if (tx.outputs[0].lockingScript.toHex() !== t.payScriptHex || tx.outputs[0].satoshis !== Number(t.priceSats)) bad('output 0 is not the provider payment')
  const offerSource = tx.inputs[0].sourceTransaction!.outputs[offerOp.vout]
  const offerCredits = decodeBsv21(offerSource.lockingScript)
  if (offerCredits === null || offerCredits.amount !== BigInt(t.credits)) bad('offer input does not carry N credits')

  // Every participant: input j+1 ↔ credit output j+1 ↔ change output n+1+j (interactive only).
  let total = 0n
  let mine = -1
  for (let j = 0; j < n; j++) {
    const p = plan.participants[j]
    const op = parseOutpoint(p.outpoint)
    const vin = j + 1
    if (txidOf(tx, vin) !== op.txid || tx.inputs[vin].sourceOutputIndex !== op.vout) bad(`input ${vin} is not ${p.outpoint}`)
    const credit = tx.outputs[vin]
    const d = decodeBsv21Owned(credit.lockingScript)
    if (d === null || d.op !== 'transfer' || d.id !== t.tokenId || d.amount !== BigInt(p.credits) || credit.satoshis !== 1) bad(`output ${vin} is not ${p.credits} credits`)
    total += BigInt(p.credits)
    const coin = tx.inputs[vin].sourceTransaction!.outputs[op.vout]
    // Who owns the credits is the pledge's on-chain choice, never the plan's: a coordinator
    // must not move a vault agent's credits to a plain P2PKH (guard bypass) or lock anyone else's.
    const record = pledgeRecordOf(tx.inputs[vin].sourceTransaction!)
    const lock = creditLockOf(record)
    if (p.creditLock !== lock) bad(`participant ${vin}: creditLock ≠ its pledge record`)
    if (lock === 'vault') {
      if (d!.owner.kind !== 'vault' || d!.owner.vaultScriptHex !== coin.lockingScript.toHex()) bad(`output ${vin} is not locked to the pledge coin's vault script`)
    } else if (d!.owner.kind !== 'p2pkh') bad(`output ${vin} is not a P2PKH credit output`)
    // Lighthouse is also the pledge's on-chain choice: its coin sits on the script its record names,
    // its credits go to its own receive address, and it gets no change.
    const lighthouse = isLighthouseRecord(record)
    if ((p.mode === 'lighthouse') !== lighthouse) bad(`participant ${vin}: mode ≠ its pledge record`)
    let change: { satoshis?: number } = { satoshis: 0 }
    if (lighthouse) {
      if (coin.lockingScript.toHex() !== lighthouseLockingScript(record).toHex()) bad(`input ${vin} is not on its lighthouse script`)
      if (d!.owner.kind !== 'p2pkh' || d!.owner.pkh !== receivePkh(record.participant, Number(record.tokenIndex))) bad(`output ${vin} does not pay the lighthouse pledger`)
      if (p.changeSats !== '0') bad(`participant ${vin}: a lighthouse pledge has no change`)
    } else {
      change = tx.outputs[n + 1 + j]
      if (tx.outputs[n + 1 + j].lockingScript.toHex() !== coin.lockingScript.toHex()) bad(`change ${n + 1 + j} does not return to the pledge coin's script`)
      if (String(change.satoshis) !== p.changeSats || change.satoshis! < 1) bad(`change ${n + 1 + j} ≠ plan`)
    }
    if (p.outpoint === myOutpoint) {
      mine = j
      if (p.credits !== opts.expectedCredits) bad(`my credits are ${p.credits}, expected ${opts.expectedCredits}`)
      // Vault-locked credits are already bound to my own coin's script above; the P2PKH check is for P2PKH credits.
      if (opts.expectedCreditPkh !== undefined && d!.owner.kind === 'p2pkh' && d!.owner.pkh !== opts.expectedCreditPkh) bad('my credit output pays someone else')
      const cost = coin.satoshis! - change.satoshis!
      const maxCost = Number(creditsCost(t, p.credits)) + 1 + (opts.maxFeeSats ?? 1000)
      if (cost > maxCost) bad(`I would pay ${cost} sats, at most ${maxCost} accepted`)
    }
  }
  if (mine === -1) bad(`my pledge ${myOutpoint} is not in the plan`)
  if (total !== BigInt(t.credits)) bad(`credits sum to ${total}, expected ${t.credits}`)
  if (new Set(plan.participants.map(p => p.outpoint)).size !== n) bad('duplicate pledge')

  // OP_RETURN settle commits to these terms and exactly this pledge list.
  const settle = parseOpReturn(tx.outputs[tx.outputs.length - 1].lockingScript as LockingScript)
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
