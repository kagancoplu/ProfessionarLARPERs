/**
 * Coordinator side of lock-in (track A 1.4, FINAL-IDEA §4.4–4.5): pick the
 * participants deterministically and build the unsigned settlement template.
 *
 *   in 0      offer (N credits, 1 sat, SINGLE|ACP)  ↔  out 0       P sats → payScript
 *   in 1..n   pledge coins (ALL)                    ↔  out 1..n    BSV-21 transfer k_i → receivePkh(participant_i, tokenIndex_i)
 *                                                      out n+1..2n  change_i → pledge coin_i's own locking script
 *                                                      out 2n+1     OP_RETURN agentcoop settle
 *
 * Participant i owes ceil(k_i·P/N) + 1 (its credit output) + its fee share;
 * change_i = coin_i − that, and must stay ≥ 1 sat or the pledge is skipped.
 * planSettlement is pure: chain facts (height, fee rate, the offer's source
 * transaction) come in through `chain`.
 */
import { Hash, LockingScript, Transaction, UnlockingScript, Utils } from '../sdk'
import { buildBsv21Script } from '../kit/inscription'
import { receivePkh } from '../kit/addresses'
import { AgentCoopError } from '../errors'
import { buildOpReturn } from '../scripts/opreturn'
import { OVERFILL_PERCENT, P2PKH_UNLOCKING_SCRIPT_LENGTH, type Offer, type PledgeRecord, type SettlementParticipant, type SettlementPlan } from '../types'
import { parseOutpoint } from '../util/outpoint'
import { creditsCost, termsHash, validateTerms } from './terms'

export interface PledgeCandidate {
  outpoint: string                  // txid_vout
  satoshis: number
  lockingScriptHex: string
  record: PledgeRecord
  /** The pledge transaction, with its ancestry linked (Transaction.fromAtomicBEEF / overlay BEEF). */
  sourceTx: Transaction
  /** Mined height, undefined while unmined (ordering rule, MASTER §3.2). */
  blockHeight?: number
  /** Overrides the length implied by record.signer (vault: Track D's VaultSigner value). */
  unlockingScriptLength?: number
}

export interface ChainInfo {
  height: number
  /** Fee rate, sats per 1000 bytes (Arcade /health policy). */
  satsPerKb: number
  /** The transaction that holds the offer UTXO (poolId). */
  offerSourceTx: Transaction
}

export interface PlanOptions {
  round?: number
  /** Blacklisted outpoints (did not sign in an earlier round). */
  exclude?: string[]
}

/** Default unlocking-script length per signer type until Track D fixes the vault value (track A 2.5). */
export const VAULT_UNLOCKING_SCRIPT_LENGTH = 1 + 74 + 74 + 1 // OP_0 dummy, 2 × (push + ≤73-byte sig), OP_FALSE branch selector

const unlockLength = (p: PledgeCandidate): number =>
  p.unlockingScriptLength ?? (p.record.signer === 'vault' ? VAULT_UNLOCKING_SCRIPT_LENGTH : P2PKH_UNLOCKING_SCRIPT_LENGTH)

/** (blockHeight asc, txid asc); unmined last, by txid. */
export function orderPledges<T extends { outpoint: string, blockHeight?: number }> (pledges: T[]): T[] {
  const txid = (p: T): string => parseOutpoint(p.outpoint).txid
  return [...pledges].sort((a, b) => {
    const ha = a.blockHeight ?? Number.POSITIVE_INFINITY
    const hb = b.blockHeight ?? Number.POSITIVE_INFINITY
    if (ha !== hb) return ha < hb ? -1 : 1
    const ta = txid(a); const tb = txid(b)
    if (ta !== tb) return ta < tb ? -1 : 1
    return parseOutpoint(a.outpoint).vout - parseOutpoint(b.outpoint).vout
  })
}

/** sha256 hex of the included outpoints, sorted lexicographically and joined with ','. */
export function pledgeListHash (outpoints: string[]): string {
  return Utils.toHex(Hash.sha256(Utils.toArray([...outpoints].sort().join(','), 'utf8')))
}

const varintLen = (n: number): number => (n < 0xfd ? 1 : n <= 0xffff ? 3 : 5)

interface Built { tx: Transaction, participants: SettlementParticipant[], listHash: string }

function buildTemplate (offer: Offer, chain: ChainInfo, chosen: PledgeCandidate[], fees: number[], round: number): Built {
  const t = offer.terms
  const { vout } = parseOutpoint(offer.poolId)
  const tx = new Transaction()
  tx.addInput({ sourceTransaction: chain.offerSourceTx, sourceOutputIndex: vout, unlockingScript: UnlockingScript.fromHex(offer.unlockingScriptHex), sequence: 0xffffffff })
  tx.addOutput({ lockingScript: LockingScript.fromHex(t.payScriptHex), satoshis: Number(t.priceSats) })
  const participants: SettlementParticipant[] = []
  chosen.forEach((p, i) => {
    const { vout: pv } = parseOutpoint(p.outpoint)
    tx.addInput({ sourceTransaction: p.sourceTx, sourceOutputIndex: pv, unlockingScript: new UnlockingScript(), sequence: 0xffffffff })
    tx.addOutput({
      lockingScript: buildBsv21Script({ op: 'transfer', id: t.tokenId, amt: p.record.credits }, receivePkh(p.record.participant, Number(p.record.tokenIndex))),
      satoshis: 1
    })
    const change = p.satoshis - Number(creditsCost(t, p.record.credits)) - 1 - fees[i]
    participants.push({ outpoint: p.outpoint, participant: p.record.participant, credits: p.record.credits, signer: p.record.signer, changeSats: String(change) })
  })
  chosen.forEach((p, i) => {
    tx.addOutput({ lockingScript: LockingScript.fromHex(p.lockingScriptHex), satoshis: Math.max(Number(participants[i].changeSats), 1) })
  })
  const listHash = pledgeListHash(chosen.map(p => p.outpoint))
  tx.addOutput({
    lockingScript: buildOpReturn('settle', { v: '1', poolId: t.poolId, termsHash: termsHash(t), pledgeListHash: listHash, round: String(round) }),
    satoshis: 0
  })
  return { tx, participants, listHash }
}

/** Serialized size once every pledge input carries its real unlocking script. */
function signedSize (tx: Transaction, chosen: PledgeCandidate[]): number {
  let size = tx.toBinary().length // pledge inputs serialized with empty scripts (1-byte varint)
  for (const p of chosen) { const l = unlockLength(p); size += l + varintLen(l) - 1 }
  return size
}

/** Greedy in order: take a pledge while the running total stays ≤ N; stop at exactly N. */
function pickExact (ordered: PledgeCandidate[], n: bigint): PledgeCandidate[] | null {
  const out: PledgeCandidate[] = []
  let sum = 0n
  for (const p of ordered) {
    const k = BigInt(p.record.credits)
    if (sum + k > n) continue
    out.push(p); sum += k
    if (sum === n) return out
  }
  return null
}

export function planSettlement (offer: Offer, pledges: PledgeCandidate[], chain: ChainInfo, opts: PlanOptions = {}): SettlementPlan {
  const t = offer.terms
  validateTerms(t)
  if (offer.poolId !== t.poolId) throw new AgentCoopError('BAD_PLAN', 'offer.poolId ≠ terms.poolId')
  if (chain.height > Number(t.deadlineHeight)) throw new AgentCoopError('DEADLINE_PASSED', `height ${chain.height} > deadline ${t.deadlineHeight}`)
  const n = BigInt(t.credits)
  const round = opts.round ?? 1
  const exclude = new Set(opts.exclude ?? [])

  // Eligible pledges in rule order. Up to 120% of the target is considered; the
  // window is recomputed after dropping coins that cannot cover their share + fee.
  const cap = n * BigInt(OVERFILL_PERCENT) / 100n
  const ordered = orderPledges(pledges).filter(p => {
    const k = BigInt(p.record.credits)
    return !exclude.has(p.outpoint) && p.record.poolId === t.poolId && p.record.v === '1' && k >= BigInt(t.minCredits) && k <= n
  })
  const dropped = new Set<PledgeCandidate>()
  for (;;) {
    let running = 0n
    const pool: PledgeCandidate[] = []
    for (const p of ordered) {
      if (dropped.has(p)) continue
      const k = BigInt(p.record.credits)
      if (running + k > cap) continue
      running += k
      pool.push(p)
    }
    const chosen = pickExact(pool, n)
    if (chosen === null) throw new AgentCoopError('BAD_PLAN', `pledges cannot fill exactly ${t.credits} credits`)
    const zero = chosen.map(() => 0)
    const size = signedSize(buildTemplate(offer, chain, chosen, zero, round).tx, chosen)
    const fee = Math.ceil(size * chain.satsPerKb / 1000)
    const base = Math.floor(fee / chosen.length)
    const fees = chosen.map((_, i) => base + (i < fee % chosen.length ? 1 : 0))
    const short = chosen.filter((p, i) => p.satoshis - Number(creditsCost(t, p.record.credits)) - 1 - fees[i] < 1)
    if (short.length > 0) { short.forEach(p => dropped.add(p)); continue }
    const { tx, participants, listHash } = buildTemplate(offer, chain, chosen, fees, round)
    return { poolId: t.poolId, round, participants, pledgeListHash: listHash, templateBEEF: tx.toAtomicBEEF() }
  }
}
