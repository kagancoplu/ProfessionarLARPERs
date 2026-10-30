/**
 * Guard policy engine (plan/phases/D-P1.md §7.2). Pure: no wallet, no I/O.
 *
 * evaluateCosign decides whether the guard may co-sign one vault input. It
 * computes the sighash itself (no blind signing), checks the agent's signature
 * over it, classifies every output and applies the owner's policy. Each check
 * is tagged with its row in D-P1 §7.2 (G1…G12) and the FINAL-IDEA §8 threat it closes.
 */
import { Transaction, Utils } from '@bsv/sdk'
import {
  providerPayScript,
  vaultSighash,
  verifyVaultSignature,
  type VaultKeys,
  type VaultRecord
} from '../../../packages/core/src/scripts/vault'
import type { CosignContext, PayeeProof } from '../../../packages/core/src/signers/VaultSigner'

export interface GuardPolicy {
  /** Provider identity keys the agent may pay. */
  allowProviders: string[]
  /** Upper bound on the sum of provider payments in one transaction. */
  maxPerPoolSats: number
  /** Upper bound on the vault's outflow over a rolling 7 days. */
  weeklyCapSats: number
  /** Upper bound on the miner fee of one transaction. */
  maxFeeSats: number
  /** Daily top-up of the agent's hot wallet (enforced from D-P2.2). */
  hotWalletDailySats: number
}

export interface RegisteredVault {
  record: VaultRecord
  lockingScriptHex: string
  keys: VaultKeys
  registeredAt: string
}

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const IDENTITY_RE = /^0[23][0-9a-f]{64}$/
const SATS_FIELDS = ['maxPerPoolSats', 'weeklyCapSats', 'maxFeeSats', 'hotWalletDailySats'] as const
const isSats = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0

export function validatePolicy (json: unknown): GuardPolicy | null {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return null
  const j = json as Record<string, unknown>
  if (!Array.isArray(j.allowProviders) || !j.allowProviders.every(p => typeof p === 'string' && IDENTITY_RE.test(p))) return null
  if (!SATS_FIELDS.every(f => isSats(j[f]))) return null
  return {
    allowProviders: [...new Set(j.allowProviders as string[])],
    maxPerPoolSats: j.maxPerPoolSats as number,
    weeklyCapSats: j.weeklyCapSats as number,
    maxFeeSats: j.maxFeeSats as number,
    hotWalletDailySats: j.hotWalletDailySats as number
  }
}

/** G1: an AtomicBEEF (number[] or hex) → the transaction, with its inputs' sources attached. */
export function decodeTxBEEF (txBEEF: unknown): Transaction {
  let bytes: number[]
  if (typeof txBEEF === 'string' && /^([0-9a-f]{2})+$/i.test(txBEEF)) bytes = Utils.toArray(txBEEF, 'hex')
  else if (Array.isArray(txBEEF) && txBEEF.every(b => Number.isInteger(b) && b >= 0 && b <= 255)) bytes = txBEEF
  else throw new Error('txBEEF must be AtomicBEEF bytes (number[] or hex)')
  return Transaction.fromAtomicBEEF(bytes)
}

export interface EvaluateInput {
  tx: Transaction
  inputIndex: number
  agent: string
  agentSignatureHex: string
  context: CosignContext
  findVault: (lockingScriptHex: string) => RegisteredVault | undefined
  policyFor: (owner: string, agent: string) => GuardPolicy | undefined
  /** Outflow already counted for (owner, agent) in the window, without entries for `excludeOutpoint`. */
  spentInWindow: (owner: string, agent: string, excludeOutpoint: string) => number
}

export interface CosignAllowed {
  ok: true
  vault: RegisteredVault
  sighash: number[]
  /** "txid.vout" of the vault input. */
  vaultOutpoint: string
  vaultInSats: number
  vaultReturnSats: number
  /** vaultIn − vaultReturn: what the vault loses with this transaction. */
  outflowSats: number
  paidSats: number
  feeSats: number
  externalInSats: number
  unlistedOutSats: number
  windowSpentSats: number
  payees: PayeeProof[]
}

export interface CosignDenied {
  ok: false
  status: 400 | 403
  reason: string
  vault?: RegisteredVault
  vaultOutpoint?: string
}

const deny = (status: 400 | 403, reason: string, extra: Partial<CosignDenied> = {}): CosignDenied => ({ ok: false, status, reason, ...extra })
const short = (key: string): string => `${key.slice(0, 10)}…`
const isOpReturn = (hex: string): boolean => hex.startsWith('006a') || hex.startsWith('6a')

export function evaluateCosign (e: EvaluateInput): CosignAllowed | CosignDenied {
  const { tx, inputIndex, context } = e

  // G1: every input has its source, and the source hashes to the input's prevout txid.
  // BIP-143 signs only this input's own amount; without this the agent could lie about
  // the other inputs and pass G9 (and the fee check) with vault funds.
  if (!Number.isInteger(inputIndex) || inputIndex < 0 || inputIndex >= tx.inputs.length) return deny(400, `bad request: no input ${inputIndex}`)
  const sourceSats: number[] = []
  const sourceScripts: string[] = []
  for (const [i, input] of tx.inputs.entries()) {
    const src = input.sourceTransaction
    const out = src?.outputs[input.sourceOutputIndex]
    if (src === undefined || out?.satoshis === undefined) return deny(400, `missing source for input ${i}`)
    if (input.sourceTXID !== undefined && src.id('hex') !== input.sourceTXID) return deny(400, `source txid mismatch for input ${i}`)
    sourceSats.push(out.satoshis)
    sourceScripts.push(out.lockingScript.toHex())
  }

  // G2: only 'pay' in D-P1; 'settle' needs A's verifySettlementPlan + verifyLineage (D-P2), 'rail' D-P3.
  if (context?.kind !== 'pay') return deny(403, `kind '${String(context?.kind)}' not enabled`)

  // G3: the input is a registered vault of this agent, and the only input from that vault.
  const vaultScript = sourceScripts[inputIndex]
  const vault = e.findVault(vaultScript)
  if (vault === undefined) return deny(403, 'not a registered vault input')
  const vaultInput = tx.inputs[inputIndex]
  const vaultOutpoint = `${vaultInput.sourceTXID ?? vaultInput.sourceTransaction!.id('hex')}.${vaultInput.sourceOutputIndex}`
  const ctx = { vault, vaultOutpoint }
  if (vault.record.agent !== e.agent) return deny(403, 'agent mismatch', ctx)
  if (sourceScripts.filter(s => s === vaultScript).length !== 1) return deny(403, 'more than one input from this vault', ctx)

  // G4: final transactions only (no pre-signed future spends).
  if (tx.lockTime !== 0 || tx.inputs.some(i => (i.sequence ?? 0xffffffff) !== 0xffffffff)) return deny(403, 'non-final transaction', ctx)

  // G5: the guard computes the sighash (ALL|FORKID) itself; the agent must have signed exactly it.
  const sighash = vaultSighash(tx, inputIndex)
  const agentSig = /^([0-9a-f]{2})+$/i.test(e.agentSignatureHex ?? '') ? Utils.toArray(e.agentSignatureHex, 'hex') : []
  if (!verifyVaultSignature(vault.keys.agentPub, sighash, agentSig)) return deny(403, 'agent signature invalid', ctx)

  // G6: default deny without a policy from the owner.
  const policy = e.policyFor(vault.record.owner, vault.record.agent)
  if (policy === undefined) return deny(403, 'no policy', ctx)

  // G7 + G8: classify outputs; a payment needs a proof the guard recomputes from the provider's identity key.
  const payees = context.payees ?? []
  const byVout = new Map<number, PayeeProof>()
  for (const p of payees) {
    if (p === null || typeof p !== 'object' || !Number.isInteger(p.vout) || typeof p.provider !== 'string' || typeof p.keyID !== 'string' || p.keyID.length === 0 || byVout.has(p.vout) || tx.outputs[p.vout] === undefined) {
      return deny(400, 'bad payee entry', ctx)
    }
    byVout.set(p.vout, p)
  }
  let vaultReturn = 0
  let paid = 0
  let unlisted = 0
  for (const [vout, out] of tx.outputs.entries()) {
    const sats = out.satoshis ?? 0
    const hex = out.lockingScript.toHex()
    const proof = byVout.get(vout)
    if (proof !== undefined) {
      if (!policy.allowProviders.includes(proof.provider)) return deny(403, `provider not allowed: ${short(proof.provider)}`, ctx)
      let expected: string
      try { expected = providerPayScript(proof.provider, proof.keyID).toHex() } catch { return deny(400, 'bad payee entry', ctx) }
      if (expected !== hex) return deny(403, `payee proof mismatch at vout ${vout}`, ctx)
      paid += sats
    } else if (hex === vaultScript) {
      vaultReturn += sats
    } else if (isOpReturn(hex)) {
      if (sats > 0) return deny(403, 'OP_RETURN output carries sats', ctx)
    } else {
      unlisted += sats
    }
  }

  // G9: vault money never reaches an output without a proof; only the agent's own inputs may.
  const vaultIn = sourceSats[inputIndex]
  const externalIn = sourceSats.reduce((s, v) => s + v, 0) - vaultIn
  if (unlisted > externalIn) return deny(403, 'vault funds to unlisted output', ctx)

  // G10: fee cap (amounts authenticated by G1).
  const totalOut = tx.outputs.reduce((s, o) => s + (o.satoshis ?? 0), 0)
  const fee = vaultIn + externalIn - totalOut
  if (fee < 0) return deny(400, 'outputs exceed inputs', ctx)
  if (fee > policy.maxFeeSats) return deny(403, `maxFeeSats exceeded (${fee} > ${policy.maxFeeSats})`, ctx)

  // G11: per-transaction payment cap.
  if (paid > policy.maxPerPoolSats) return deny(403, `maxPerPoolSats exceeded (${paid} > ${policy.maxPerPoolSats})`, ctx)

  // G12: rolling weekly cap on the vault's outflow.
  const outflow = Math.max(0, vaultIn - vaultReturn)
  const windowSpent = e.spentInWindow(vault.record.owner, vault.record.agent, vaultOutpoint)
  if (windowSpent + outflow > policy.weeklyCapSats) return deny(403, `weeklyCapSats exceeded (${windowSpent} + ${outflow} > ${policy.weeklyCapSats})`, ctx)

  return {
    ok: true,
    vault,
    sighash,
    vaultOutpoint,
    vaultInSats: vaultIn,
    vaultReturnSats: vaultReturn,
    outflowSats: outflow,
    paidSats: paid,
    feeSats: fee,
    externalInSats: externalIn,
    unlistedOutSats: unlisted,
    windowSpentSats: windowSpent,
    payees: [...byVout.values()]
  }
}
