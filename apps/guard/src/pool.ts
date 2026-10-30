/**
 * Pool and pledge facts the guard reads from the chain itself (plan/phases/D-P2.md §4.2–4.7).
 * Pure: the transactions come in already bound to their txids (G1, or a hash check).
 *
 *   pool tx (A's buildReserveAndAnnounce):  out0 offer UTXO (N credits → provider's `offer <nonce>` key)
 *                                           OP_RETURN agentcoop pool { terms − poolId, nonce }
 *   pledge tx (A.3.1 layout):               out0 pledge coin · out1 feeSats → payScriptHex · out2 OP_RETURN agentcoop pledge
 */
import { Beef, Transaction, Utils } from '@agentcoop/core/sdk'
import {
  AgentCoopError,
  PROVIDER_PROTOCOL,
  anyonePkh,
  decodeBsv21,
  parseOpReturn,
  parseOutpoint,
  validateTerms,
  type LineageResult,
  type PledgeRecord,
  type PoolTerms
} from '@agentcoop/core'
import { providerPayScript } from '@agentcoop/core/scripts/vault'
import type { GuardPolicy } from './policy'

export interface PoolFacts {
  poolId: string
  terms: PoolTerms
  /** keyID of the provider's revenue key (payScript) and of its offer key (`offer <nonce>`). */
  nonce: string
  /** BSV-21 owner of the offer UTXO, if it is one. */
  offerOwnerPkh?: string
  /** verifyLineage(poolId), when the guard ran it. */
  lineage?: Pick<LineageResult, 'ok' | 'reason' | 'tokenId' | 'amt'>
}

const UINT = /^(0|[1-9]\d*)$/
const IDENTITY_RE = /^0[23][0-9a-f]{64}$/
const OUTPOINT_RE = /^[0-9a-f]{64}_\d+$/
const short = (key: string): string => `${key.slice(0, 10)}…`

export function validatePledgeRecord (json: unknown): PledgeRecord | null {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return null
  const j = json as Record<string, unknown>
  if (j.v !== '1' || typeof j.poolId !== 'string' || !OUTPOINT_RE.test(j.poolId)) return null
  if (typeof j.credits !== 'string' || !UINT.test(j.credits) || BigInt(j.credits) <= 0n) return null
  if (typeof j.participant !== 'string' || !IDENTITY_RE.test(j.participant)) return null
  if (typeof j.tokenIndex !== 'string' || !UINT.test(j.tokenIndex)) return null
  if (j.signer !== 'p2pkh' && j.signer !== 'vault') return null
  return { v: '1', poolId: j.poolId, credits: j.credits, participant: j.participant, tokenIndex: j.tokenIndex, signer: j.signer }
}

/** The transaction's `agentcoop pledge` record: null if it has none, 'invalid' if it has a malformed one (or two). */
export function findPledgeRecord (tx: Transaction): { vout: number, record: PledgeRecord } | null | 'invalid' {
  const found: Array<{ vout: number, json: unknown }> = []
  tx.outputs.forEach((o, vout) => {
    const r = parseOpReturn(o.lockingScript)
    if (r?.op === 'pledge') found.push({ vout, json: r.json })
  })
  if (found.length === 0) return null
  if (found.length > 1) return 'invalid'
  const record = validatePledgeRecord(found[0].json)
  return record === null ? 'invalid' : { vout: found[0].vout, record }
}

/** Terms and nonce from the pool transaction (its txid must already equal poolId's). Throws with a reason. */
export function poolFactsFromTx (poolTx: Transaction, poolId: string): PoolFacts {
  const { txid, vout } = parseOutpoint(poolId)
  if (poolTx.id('hex') !== txid) throw new Error(`pool transaction is not ${txid}`)
  const records = poolTx.outputs.map(o => parseOpReturn(o.lockingScript)).filter(r => r?.op === 'pool')
  if (records.length !== 1) throw new Error('no pool record in the pool transaction')
  const { nonce, ...rest } = records[0]!.json as Record<string, unknown>
  if (typeof nonce !== 'string' || nonce.length === 0) throw new Error('pool record has no nonce')
  const terms = { ...rest, poolId } as unknown as PoolTerms
  try { validateTerms(terms) } catch (e) { throw new Error((e as Error).message) }
  const offer = poolTx.outputs[vout]
  const d = offer === undefined ? null : decodeBsv21(offer.lockingScript)
  return { poolId, terms, nonce, ...(d !== null ? { offerOwnerPkh: d.ownerPkh } : {}) }
}

/**
 * The pool's provider is one the owner allows, and the pool really is theirs:
 * revenue goes to their key for this nonce and the offer UTXO sits on their
 * `offer <nonce>` key (only they can sign the offer). Returns a reason or null.
 */
export function providerReason (pool: PoolFacts, policy: GuardPolicy): string | null {
  const { provider, payScriptHex } = pool.terms
  if (!policy.allowProviders.includes(provider)) return `provider not allowed: ${short(provider)}`
  if (providerPayScript(provider, pool.nonce).toHex() !== payScriptHex) return "pool payScript is not the provider's revenue key"
  if (pool.offerOwnerPkh !== anyonePkh(provider, `offer ${pool.nonce}`, PROVIDER_PROTOCOL)) return "offer UTXO is not the provider's"
  return null
}

/** Lineage verdict for the pool's offer credits, or a reason. */
export function lineageReason (pool: PoolFacts): string | null {
  const l = pool.lineage
  if (l === undefined) return 'LINEAGE_FAILED: offer credits not verified'
  if (!l.ok) return `LINEAGE_FAILED: ${l.reason ?? 'offer credits are not genuine'}`
  if (l.tokenId !== pool.terms.tokenId || l.amt !== BigInt(pool.terms.credits)) return `LINEAGE_FAILED: offer carries ${String(l.amt)} of ${String(l.tokenId)}`
  return null
}

/** A transaction `txid` from AtomicBEEF, BEEF or a raw transaction (number[] or hex). Throws if absent or if it hashes to something else. */
export function txFromBytes (data: unknown, txid: string): Transaction {
  let bytes: number[]
  if (typeof data === 'string' && /^([0-9a-f]{2})+$/i.test(data)) bytes = Utils.toArray(data, 'hex')
  else if (Array.isArray(data) && data.every(b => Number.isInteger(b) && b >= 0 && b <= 255)) bytes = data
  else throw new Error('expected bytes (number[] or hex)')
  const attempts: Array<() => Transaction | undefined> = [
    () => Transaction.fromAtomicBEEF(bytes),
    () => Beef.fromBinary(bytes).findTxid(txid)?.tx,
    () => Transaction.fromBinary(bytes)
  ]
  for (const attempt of attempts) {
    let tx: Transaction | undefined
    try { tx = attempt() } catch { continue }
    if (tx !== undefined && tx.id('hex') === txid) return tx
  }
  throw new Error(`no transaction ${txid} in the given bytes`)
}

/** `AgentCoopError` → "CODE: message" (already its message); anything else → its message. */
export const errorReason = (e: unknown): string => e instanceof AgentCoopError ? e.message : e instanceof Error ? e.message : String(e)
