/**
 * Guard 'settle' path (plan/phases/D-P2.md §4.1–4.6, §7.1 S1–S7): co-sign the
 * agent's vault pledge coin in a coordinator's settlement round.
 *
 * The guard trusts neither the coordinator nor the overlay. It builds the
 * transaction from the plan itself (planTransaction), reads the pool's terms
 * and nonce from the offer input's own source transaction (bound by txid), the
 * expected credits from the pledge record in the pledge coin's source
 * transaction, and runs Track A's verifySettlementPlan with verifyLineage
 * (DvP: my credits to my agent's token address, change back to the vault, fee
 * share ≤ maxFeeSats, offer signature, pledge-list and terms hashes, the
 * credits' lineage). Then the owner's caps.
 */
import type { Transaction } from '@agentcoop/core/sdk'
import {
  coopOutpoint,
  creditsCost,
  planTransaction,
  receivePkh,
  verifySettlementPlan,
  type LineageOptions,
  type Offer,
  type SettlementPlan
} from '@agentcoop/core'
import type { CosignContext } from '@agentcoop/core/signers/VaultSigner'
import { deny, inputOutpoint, inputSources, vaultInputChecks, type CosignAllowed, type CosignDenied, type EvaluateInput } from './policy'
import { errorReason, findPledgeRecord, poolFactsFromTx, providerReason } from './pool'
import type { LedgerDraft } from './store'

export interface SettleInput extends Pick<EvaluateInput, 'agent' | 'agentSignatureHex' | 'findVault' | 'policyFor' | 'spentInWindow'> {
  plan: unknown
  inputIndex: number
  context: CosignContext
  poolSpent: NonNullable<EvaluateInput['poolSpent']>
  /** The reservation key among a pledge transaction's inputs ("txid.vout"), if the guard reserved one at pledge time. */
  reservationFor: (owner: string, agent: string, pledgeTxInputs: string[]) => string | undefined
  /** Fetcher and shared cache for verifyLineage. */
  lineage: LineageOptions
}

function isPlan (p: unknown): p is SettlementPlan {
  if (p === null || typeof p !== 'object') return false
  const x = p as Record<string, unknown>
  return typeof x.poolId === 'string' && typeof x.round === 'number' && typeof x.pledgeListHash === 'string' &&
    Array.isArray(x.participants) && Array.isArray(x.templateBEEF)
}

export async function evaluateSettle (e: SettleInput): Promise<CosignAllowed | CosignDenied> {
  // S1: the plan is the only source of the transaction; the guard builds it itself.
  if (!isPlan(e.plan)) return deny(400, 'bad request: plan (SettlementPlan) required for settle')
  const plan = e.plan
  let tx: Transaction
  try { tx = planTransaction(plan) } catch (err) { return deny(400, `bad request: plan (${errorReason(err)})`) }
  const sources = inputSources(tx) // G1
  if ('ok' in sources) return sources
  if (e.context.poolId !== plan.poolId) return deny(403, 'pool mismatch')
  const n = plan.participants.length
  const i = e.inputIndex
  if (!Number.isInteger(i) || i < 1 || i > n || i >= tx.inputs.length) return deny(400, `input ${String(i)} is not a pledge input`)

  // S2 = G3–G6 on the pledge coin.
  const checked = vaultInputChecks({ ...e, tx, inputIndex: i }, sources.scripts)
  if ('ok' in checked) return checked
  const { vault, vaultOutpoint, sighash, policy } = checked
  const ctx = { vault, vaultOutpoint }
  const { owner, agent } = vault.record

  // S3: the pledge record on chain says what this coin buys and for whom.
  const pledgeTx = tx.inputs[i].sourceTransaction!
  const found = findPledgeRecord(pledgeTx)
  if (found === null || found === 'invalid' || tx.inputs[i].sourceOutputIndex !== 0) return deny(403, 'no pledge record for this input', ctx)
  const { record } = found
  if (record.participant !== agent || record.signer !== 'vault') return deny(403, 'pledge record does not name this agent', ctx)
  if (record.poolId !== plan.poolId) return deny(403, 'pool mismatch', ctx)
  if (e.context.expectedCredits !== undefined && e.context.expectedCredits !== record.credits) return deny(403, `expectedCredits mismatch (${e.context.expectedCredits} ≠ ${record.credits} pledged)`, ctx)

  // S4: terms and nonce from the offer input's source transaction (the pool tx, bound by txid).
  const offerIn = tx.inputs[0]
  let pool
  try { pool = poolFactsFromTx(offerIn.sourceTransaction!, plan.poolId) } catch (err) { return deny(403, errorReason(err), ctx) }
  if (e.context.tokenId !== undefined && e.context.tokenId !== pool.terms.tokenId) return deny(403, 'token mismatch', ctx)

  // S5: an allowed provider, and the pool really is theirs.
  const reason = providerReason(pool, policy)
  if (reason !== null) return deny(403, reason, ctx)

  // S6: the whole settlement, as a participant checks it, plus the credits' lineage.
  const offerOut = offerIn.sourceTransaction!.outputs[offerIn.sourceOutputIndex]
  const offer: Offer = {
    poolId: plan.poolId,
    unlockingScriptHex: offerIn.unlockingScript?.toHex() ?? '',
    lockingScriptHex: offerOut.lockingScript.toHex(),
    satoshis: offerOut.satoshis ?? 0,
    terms: pool.terms
  }
  const myOutpoint = coopOutpoint(inputOutpoint(tx, i).split('.')[0], tx.inputs[i].sourceOutputIndex)
  try {
    await verifySettlementPlan(plan, offer, myOutpoint, {
      expectedCredits: record.credits,
      expectedCreditPkh: receivePkh(agent, Number(record.tokenIndex)),
      maxFeeSats: policy.maxFeeSats,
      verifyLineage: true,
      lineage: e.lineage
    })
  } catch (err) {
    return deny(403, errorReason(err), ctx)
  }

  // S7: the owner's caps. What the vault loses = coin − change (the change returns to the vault script, S6).
  const coin = sources.sats[i]
  const change = tx.outputs[n + i].satoshis ?? 0
  const cost = coin - change
  const pledgeInputs = pledgeTx.inputs.map((_, k) => inputOutpoint(pledgeTx, k))
  const key = e.reservationFor(owner, agent, pledgeInputs) ?? vaultOutpoint
  const poolBefore = e.poolSpent(owner, agent, plan.poolId, [key])
  if (poolBefore + cost > policy.maxPerPoolSats) return deny(403, `maxPerPoolSats exceeded (${poolBefore} + ${cost} > ${policy.maxPerPoolSats})`, ctx)
  const windowSpent = e.spentInWindow(owner, agent, [key])
  if (windowSpent + cost > policy.weeklyCapSats) return deny(403, `weeklyCapSats exceeded (${windowSpent} + ${cost} > ${policy.weeklyCapSats})`, ctx)

  const entries: LedgerDraft[] = [{ outpoint: key, outflowSats: cost, kind: 'settle', poolId: plan.poolId, poolSats: cost }]
  return {
    ok: true,
    vault,
    sighash,
    vaultOutpoint,
    vaultInSats: coin,
    vaultReturnSats: change,
    outflowSats: cost,
    paidSats: cost,
    feeSats: cost - Number(creditsCost(pool.terms, record.credits)) - 1, // this agent's share of the miner fee
    externalInSats: 0,
    unlistedOutSats: 0,
    windowSpentSats: windowSpent,
    payees: [],
    hotSats: 0,
    entries
  }
}
