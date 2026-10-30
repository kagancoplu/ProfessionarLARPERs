/**
 * GET /pools/:poolId/audit (plan/phases/B-P6a.md §3): re-derive a settlement
 * from the chain and check it against the deterministic selection rule.
 *
 * Chain facts (anyone can recompute them): the settle record's
 * pledgeListHash equals the hash of the inputs actually included, the
 * provider got exactly P at output 0, every included pledge got its credits
 * at its own receive address. The selection check re-runs Track A's
 * planSettlement on the pool's pledges with the coordinator's *declared*
 * blacklist: the reasons in it (timeout, bad signature, …) are the
 * coordinator's word, not chain facts. Censorship is detectable, not
 * prevented (FINAL-IDEA §8).
 */
import {
  decodeBsv21, orderPledges, parseOpReturn, planSettlement, pledgeListHash, receivePkh, termsHash,
  type PledgeCandidate, type PoolTerms
} from '@agentcoop/core'
import type { Transaction } from '@agentcoop/core/sdk'
import type { PledgeView } from '../../../packages/overlay/src/views'
import type { CoordinatorStatus } from './engine'
import type { OverlayLookup } from './overlay'
import type { CoordinatorStore } from './store'
import { OfferError } from './verifyOffer'

export interface AuditReport {
  poolId: string
  settlement: { txid: string, round: string | null, pledgeListHash: string, termsHash: string | null }
  included: Array<{ outpoint: string, participant: string, credits: string, height?: number }>
  checks: {
    hashMatches: boolean
    termsHashMatches: boolean | null
    providerPaid: boolean
    creditsDelivered: boolean
    allIncludedValid: boolean
    /** null: no stored offer to re-run the plan with */
    selectionMatches: boolean | null
  }
  /** pledges ahead of the last included one in (height, txid) order that were left out */
  skippedEarlier: Array<{ outpoint: string, participant: string, credits: string, reason: string }>
  /** what the rule picks with the declared blacklist, when it differs */
  expectedIncluded?: string[]
  verdict: 'consistent' | 'inconsistent' | 'unexplained-skips'
  notes: string[]
}

export interface AuditDeps {
  overlay: OverlayLookup
  store: CoordinatorStore
  coordinatorStatus?: (poolId: string) => CoordinatorStatus | undefined
}

const outpointOf = (tx: Transaction, i: number): string =>
  `${tx.inputs[i].sourceTXID ?? tx.inputs[i].sourceTransaction!.id('hex')}_${tx.inputs[i].sourceOutputIndex}`

/** Fee rate the settlement actually paid (sat/kB), so the re-planned fees match the real ones. */
function paidRate (tx: Transaction): number {
  const inSats = tx.inputs.reduce((s, inp) => s + (inp.sourceTransaction?.outputs[inp.sourceOutputIndex]?.satoshis ?? 0), 0)
  const outSats = tx.outputs.reduce((s, o) => s + (o.satoshis ?? 0), 0)
  return Math.max(0, Math.floor((inSats - outSats) * 1000 / tx.toBinary().length))
}

export async function auditPool (deps: AuditDeps, poolId: string): Promise<AuditReport> {
  const pool = await deps.overlay.pool(poolId)
  if (pool === undefined) throw new OfferError('POOL_NOT_FOUND', 'pool is not on the overlay', 404)
  const s = await deps.overlay.settlementWithTx(poolId)
  if (s === undefined) throw new OfferError('NOT_SETTLED', `pool is ${pool.status}; only settled pools can be audited`, 409)
  const terms: PoolTerms = pool.terms
  const tx = s.tx
  const notes: string[] = []

  const record = parseOpReturn(tx.outputs[tx.outputs.length - 1].lockingScript)?.json ?? {}
  const recordHash = typeof record.pledgeListHash === 'string' ? record.pledgeListHash : s.view.pledgeListHash
  const includedOutpoints = tx.inputs.slice(1).map((_, i) => outpointOf(tx, i + 1))

  const all = await deps.overlay.pledgeCandidatesAll(poolId)
  const byOutpoint = new Map(all.map(c => [c.view.outpoint, c]))
  const included = includedOutpoints.map(o => byOutpoint.get(o)?.view)

  // ── chain facts ──
  const hashMatches = pledgeListHash(includedOutpoints) === recordHash
  const offer = await deps.store.getOffer(poolId)
  const termsHashMatches = offer === undefined || typeof record.termsHash !== 'string' ? null : termsHash(offer.terms) === record.termsHash
  const out0 = tx.outputs[0]
  const providerPaid = out0 !== undefined && out0.satoshis === Number(terms.priceSats) && out0.lockingScript.toHex() === terms.payScriptHex
  const allIncludedValid = included.every(v => v !== undefined && (v.valid || v.spendingTxid === tx.id('hex')))
  const creditOutputs = tx.outputs.map(o => decodeBsv21(o.lockingScript)).filter(d => d !== null && d.op === 'transfer' && d.id === terms.tokenId)
  const delivered = included.every(v => v !== undefined &&
    creditOutputs.some(d => d!.ownerPkh === receivePkh(v.participant, Number(v.tokenIndex)) && d!.amt === v.credits))
  const creditsDelivered = delivered && creditOutputs.reduce((sum, d) => sum + d!.amount, 0n) === BigInt(terms.credits)

  // ── selection rule, with the coordinator's declared blacklist ──
  const declared = new Map((deps.coordinatorStatus?.(poolId)?.blacklist ?? []).map(b => [b.outpoint, b.reason]))
  const cancelled = (v: PledgeView): boolean => v.spent && v.spendingTxid !== tx.id('hex')
  const candidates: PledgeCandidate[] = all
    .filter(c => !cancelled(c.view) && (c.view.valid || c.view.spendingTxid === tx.id('hex') || c.view.invalidReason === 'pool settled'))
    .map(c => ({
      outpoint: c.view.outpoint,
      satoshis: c.view.coinSats,
      lockingScriptHex: c.sourceTx.outputs[c.view.vout].lockingScript.toHex(),
      record: { v: '1', poolId, credits: c.view.credits, participant: c.view.participant, tokenIndex: c.view.tokenIndex, signer: c.view.signer },
      sourceTx: c.sourceTx,
      ...(c.view.height !== undefined ? { blockHeight: c.view.height } : {})
    }))
  let selectionMatches: boolean | null = null
  let expected: string[] | undefined
  if (offer === undefined) {
    notes.push('no stored offer: the selection rule cannot be re-run by this coordinator')
  } else {
    const poolTx = await deps.overlay.poolTx(poolId)
    try {
      const plan = planSettlement(offer, candidates, { height: Number(terms.deadlineHeight), satsPerKb: paidRate(tx), offerSourceTx: poolTx! }, { exclude: [...declared.keys()] })
      expected = plan.participants.map(p => p.outpoint)
      selectionMatches = expected.length === includedOutpoints.length && expected.every(o => includedOutpoints.includes(o))
    } catch (e) {
      selectionMatches = false
      notes.push(`the rule finds no plan with the declared blacklist: ${String((e as Error).message)}`)
    }
  }

  // ── who was ahead in line and left out, and why ──
  const ordered = orderPledges(all.map(c => ({ ...c.view, ...(c.view.height !== undefined ? { blockHeight: c.view.height } : {}) })))
  const lastIncluded = Math.max(...ordered.map((v, i) => (includedOutpoints.includes(v.outpoint) ? i : -1)))
  const skippedEarlier = ordered.slice(0, Math.max(lastIncluded, 0))
    .filter(v => !includedOutpoints.includes(v.outpoint))
    .map(v => ({
      outpoint: v.outpoint,
      participant: v.participant,
      credits: v.credits,
      reason: declared.get(v.outpoint) ?? (cancelled(v) ? 'cancelled' : !v.valid && v.invalidReason !== 'pool settled' ? `invalid: ${v.invalidReason ?? ''}` : selectionMatches === true ? 'rule: not part of the first exact fill' : 'not explained')
    }))

  const chainOk = hashMatches && providerPaid && creditsDelivered && allIncludedValid && termsHashMatches !== false
  const verdict = !chainOk ? 'inconsistent' : selectionMatches === false || skippedEarlier.some(x => x.reason === 'not explained') ? 'unexplained-skips' : 'consistent'
  if (declared.size > 0) notes.push('blacklist reasons are the coordinator\'s declaration (off chain)')

  return {
    poolId,
    settlement: { txid: tx.id('hex'), round: typeof record.round === 'string' ? record.round : null, pledgeListHash: recordHash, termsHash: typeof record.termsHash === 'string' ? record.termsHash : null },
    included: included.map((v, i) => ({ outpoint: includedOutpoints[i], participant: v?.participant ?? '', credits: v?.credits ?? '', ...(v?.height !== undefined ? { height: v.height } : {}) })),
    checks: { hashMatches, termsHashMatches, providerPaid, creditsDelivered, allIncludedValid, selectionMatches },
    skippedEarlier,
    ...(selectionMatches === false && expected !== undefined ? { expectedIncluded: expected } : {}),
    verdict,
    notes
  }
}
