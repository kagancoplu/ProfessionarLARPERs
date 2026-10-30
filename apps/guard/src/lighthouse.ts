/**
 * Guard 'lighthouse' (Track A 5.5–5.7, D-P2c): a human pledged once, signed its coin
 * SINGLE|ANYONECANPAY over its own credit output, named this guard, and went offline.
 * In the settlement round the coordinator asks the guard instead of the human; the
 * guard co-signs ALL only after Track A's cosignLighthouse has checked the whole
 * settlement as the human would (DvP, fee cap, the offer's lineage, the human's
 * signature for this very plan, this guard named in the on-chain record).
 *
 * Like 'settle', the guard trusts neither the coordinator nor the request: the offer
 * comes from the plan's own input 0 (its source is the pool transaction, bound by
 * txid), never from the caller. No vault or policy is involved: the human chose this
 * guard for this one pledge.
 */
import {
  AgentCoopError,
  cosignLighthouse,
  planTransaction,
  type LighthousePledge,
  type LineageOptions,
  type Offer,
  type SettlementPlan
} from '@agentcoop/core'
import type { WalletInterface } from '@agentcoop/core/sdk'
import { errorReason, poolFactsFromTx } from './pool'

export interface LighthouseRequest {
  plan: unknown
  inputIndex: unknown
  pledge: unknown
}

export type LighthouseOutcome =
  | { ok: true, unlockingScriptHex: string, poolId: string, participant: string, credits: string, tokenId: string, outpoint: string }
  | { ok: false, status: 400 | 403, reason: string, poolId?: string, participant?: string, outpoint?: string }

const isPlan = (p: unknown): p is SettlementPlan => {
  if (p === null || typeof p !== 'object') return false
  const x = p as Record<string, unknown>
  return typeof x.poolId === 'string' && typeof x.round === 'number' && typeof x.pledgeListHash === 'string' && Array.isArray(x.participants) && Array.isArray(x.templateBEEF)
}

const isPledge = (p: unknown): p is LighthousePledge => {
  if (p === null || typeof p !== 'object') return false
  const x = p as Record<string, unknown>
  return typeof x.outpoint === 'string' && typeof x.satoshis === 'number' && typeof x.humanSignatureHex === 'string' &&
    typeof x.creditLockingScriptHex === 'string' && x.record !== null && typeof x.record === 'object'
}

export async function evaluateLighthouse (guardWallet: WalletInterface, req: LighthouseRequest, lineage: LineageOptions, originator?: string): Promise<LighthouseOutcome> {
  if (!isPlan(req.plan) || typeof req.inputIndex !== 'number' || !isPledge(req.pledge)) {
    return { ok: false, status: 400, reason: 'bad request: plan, inputIndex and pledge (LighthousePledge) required for lighthouse' }
  }
  const { plan, pledge } = req
  const i = req.inputIndex
  const who = { poolId: plan.poolId, participant: typeof pledge.record.participant === 'string' ? pledge.record.participant : undefined, outpoint: pledge.outpoint }

  // The offer from the plan's input 0: its source is the pool transaction (terms + nonce on chain), its unlocking script the provider's offer signature.
  let offer: Offer
  try {
    const tx = planTransaction(plan)
    const offerIn = tx.inputs[0]
    const src = offerIn?.sourceTransaction
    if (src === undefined) return { ok: false, status: 400, reason: 'bad request: the plan has no offer input source', ...who }
    const pool = poolFactsFromTx(src, plan.poolId)
    const out = src.outputs[offerIn.sourceOutputIndex]
    offer = { poolId: plan.poolId, unlockingScriptHex: offerIn.unlockingScript?.toHex() ?? '', lockingScriptHex: out.lockingScript.toHex(), satoshis: out.satoshis ?? 0, terms: pool.terms }
  } catch (e) {
    return { ok: false, status: 403, reason: errorReason(e), ...who }
  }

  try {
    const unlock = await cosignLighthouse(guardWallet, { plan, offer, inputIndex: i, pledge, lineage, ...(originator !== undefined ? { originator } : {}) })
    return { ok: true, unlockingScriptHex: unlock.toHex(), poolId: plan.poolId, participant: pledge.record.participant, credits: pledge.record.credits, tokenId: offer.terms.tokenId, outpoint: pledge.outpoint }
  } catch (e) {
    // AgentCoopError = a check failed (403); anything else is a malformed request or a fetch problem.
    return { ok: false, status: e instanceof AgentCoopError ? 403 : 400, reason: errorReason(e), ...who }
  }
}
