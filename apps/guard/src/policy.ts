/**
 * Guard policy engine (plan/phases/D-P1.md §7.2, D-P2 §7). Pure: no wallet, no I/O.
 *
 * evaluateCosign decides whether the guard may co-sign one vault input of a
 * `pay` transaction. It computes the sighash itself (no blind signing), checks
 * the agent's signature over it, classifies every output and applies the
 * owner's policy. A vault pledge (2.1b) and hot-wallet top-ups (2.2) are
 * recognised here; facts that need the network (the pool transaction, the
 * offer's lineage) are resolved by the guard beforehand and passed in.
 * Settlements ('settle') go through settle.ts. Each check is tagged with its
 * row in D-P1 §7.2 (G1…G12) / D-P2 §7 (P1…P6, H1…H3) and the FINAL-IDEA §8 threat it closes.
 */
import { Transaction, Utils } from '@agentcoop/core/sdk'
import { creditsCost } from '@agentcoop/core'
import {
  hotWalletScript,
  providerPayScript,
  vaultSighash,
  verifyVaultSignature,
  type VaultKeys,
  type VaultRecord
} from '@agentcoop/core/scripts/vault'
import type { CosignContext, HotWalletProof, PayeeProof } from '@agentcoop/core/signers/VaultSigner'
import { findPledgeRecord, lineageReason, providerReason, type PoolFacts } from './pool'
import { reserveKey, type LedgerDraft } from './store'

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
  /** Outflow already counted for (owner, agent) in the 7-day window, without the entries under `exclude`. */
  spentInWindow: (owner: string, agent: string, exclude: string[]) => number
  /** Sats (owner, agent) committed to a pool in the window, without `exclude`. Default 0. */
  poolSpent?: (owner: string, agent: string, poolId: string, exclude: string[]) => number
  /** Hot-wallet top-ups of (owner, agent) in the last 24 h, without `exclude`. Default 0. */
  hotSpent?: (owner: string, agent: string, exclude: string[]) => number
  /** 2.1b: the pool of the pledge this transaction makes (resolved by the guard), or why it could not be. */
  pledgePool?: PoolFacts | { error: string }
  /** Ledger key of the pledge reservation this vault input resolves (it spends a pledge coin), if any. */
  reservationKey?: string
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
  hotSats: number
  /** 2.1b: the pledge this transaction makes. */
  pledge?: { poolId: string, coinSats: number, feeSats: number, credits: string }
  /** What the guard records once it has signed. */
  entries: LedgerDraft[]
}

export interface CosignDenied {
  ok: false
  status: 400 | 403
  reason: string
  vault?: RegisteredVault
  vaultOutpoint?: string
}

export const deny = (status: 400 | 403, reason: string, extra: Partial<CosignDenied> = {}): CosignDenied => ({ ok: false, status, reason, ...extra })
const short = (key: string): string => `${key.slice(0, 10)}…`
const isOpReturn = (hex: string): boolean => hex.startsWith('006a') || hex.startsWith('6a')
const BASE64_RE = /^[A-Za-z0-9+/=]{1,64}$/

/** G1: every input has its source, and the source hashes to the input's prevout txid. Returns the source amounts and scripts. */
export function inputSources (tx: Transaction): { sats: number[], scripts: string[] } | CosignDenied {
  const sats: number[] = []
  const scripts: string[] = []
  for (const [i, input] of tx.inputs.entries()) {
    const src = input.sourceTransaction
    const out = src?.outputs[input.sourceOutputIndex]
    if (src === undefined || out?.satoshis === undefined) return deny(400, `missing source for input ${i}`)
    if (input.sourceTXID !== undefined && src.id('hex') !== input.sourceTXID) return deny(400, `source txid mismatch for input ${i}`)
    sats.push(out.satoshis)
    scripts.push(out.lockingScript.toHex())
  }
  return { sats, scripts }
}

export const inputOutpoint = (tx: Transaction, i: number): string =>
  `${tx.inputs[i].sourceTXID ?? tx.inputs[i].sourceTransaction!.id('hex')}.${tx.inputs[i].sourceOutputIndex}`

/** G3–G6, shared by pay and settle: registered vault of this agent, single input, final, agent signature over the guard's sighash, a policy. */
export function vaultInputChecks (e: Pick<EvaluateInput, 'tx' | 'inputIndex' | 'agent' | 'agentSignatureHex' | 'findVault' | 'policyFor'>, scripts: string[]):
  { vault: RegisteredVault, vaultOutpoint: string, sighash: number[], policy: GuardPolicy } | CosignDenied {
  const { tx, inputIndex } = e
  // G3: the input is a registered vault of this agent, and the only input from that vault.
  const vaultScript = scripts[inputIndex]
  const vault = e.findVault(vaultScript)
  if (vault === undefined) return deny(403, 'not a registered vault input')
  const vaultOutpoint = inputOutpoint(tx, inputIndex)
  const ctx = { vault, vaultOutpoint }
  if (vault.record.agent !== e.agent) return deny(403, 'agent mismatch', ctx)
  if (scripts.filter(s => s === vaultScript).length !== 1) return deny(403, 'more than one input from this vault', ctx)

  // G4: final transactions only (no pre-signed future spends).
  if (tx.lockTime !== 0 || tx.inputs.some(i => (i.sequence ?? 0xffffffff) !== 0xffffffff)) return deny(403, 'non-final transaction', ctx)

  // G5: the guard computes the sighash (ALL|FORKID) itself; the agent must have signed exactly it.
  const sighash = vaultSighash(tx, inputIndex)
  const agentSig = /^([0-9a-f]{2})+$/i.test(e.agentSignatureHex ?? '') ? Utils.toArray(e.agentSignatureHex, 'hex') : []
  if (!verifyVaultSignature(vault.keys.agentPub, sighash, agentSig)) return deny(403, 'agent signature invalid', ctx)

  // G6: default deny without a policy from the owner.
  const policy = e.policyFor(vault.record.owner, vault.record.agent)
  if (policy === undefined) return deny(403, 'no policy', ctx)
  return { vault, vaultOutpoint, sighash, policy }
}

export function evaluateCosign (e: EvaluateInput): CosignAllowed | CosignDenied {
  const { tx, inputIndex, context } = e

  // G1: every input has its source, and the source hashes to the input's prevout txid.
  // BIP-143 signs only this input's own amount; without this the agent could lie about
  // the other inputs and pass G9 (and the fee check) with vault funds.
  if (!Number.isInteger(inputIndex) || inputIndex < 0 || inputIndex >= tx.inputs.length) return deny(400, `bad request: no input ${inputIndex}`)
  const sources = inputSources(tx)
  if ('ok' in sources) return sources
  const { sats: sourceSats, scripts: sourceScripts } = sources

  // G2: this engine handles 'pay'; 'settle' is evaluated from the plan (settle.ts), 'rail' arrives in D-P3.
  if (context?.kind !== 'pay') return deny(403, `kind '${String(context?.kind)}' not enabled`)

  const checked = vaultInputChecks(e, sourceScripts)
  if ('ok' in checked) return checked
  const { vault, vaultOutpoint, sighash, policy } = checked
  const ctx = { vault, vaultOutpoint }
  const vaultScript = sourceScripts[inputIndex]
  const { owner, agent } = vault.record

  // 2.1b P1–P6: a vault pledge. Its coin stays on the vault script (the owner can still
  // withdraw it), but it is committed to the pool: it counts against maxPerPoolSats and
  // the weekly cap now, and the pool's provider must be allowed. Stops "put 100% of the
  // budget into pool X" at pledge time, before any fee is paid.
  const found = findPledgeRecord(tx)
  if (found === 'invalid') return deny(403, 'bad pledge record', ctx)
  let pledge: CosignAllowed['pledge']
  let pledgePool: PoolFacts | undefined
  if (found !== null) {
    const { record, vout } = found
    if (record.participant !== agent) return deny(403, 'pledge record does not name this agent', ctx)
    if (record.signer !== 'vault') return deny(403, "vault pledge must say signer 'vault'", ctx)
    if (vout !== 2 || tx.outputs[0]?.lockingScript.toHex() !== vaultScript || tx.outputs[1] === undefined) {
      return deny(403, 'pledge layout: out0 pledge coin on this vault, out1 fee, out2 record', ctx)
    }
    const pool = e.pledgePool
    if (pool === undefined) return deny(403, 'pool transaction not available', ctx)
    if ('error' in pool) return deny(403, pool.error, ctx)
    if (pool.poolId !== record.poolId) return deny(403, 'pool mismatch', ctx)
    const t = pool.terms
    if (BigInt(record.credits) < BigInt(t.minCredits) || BigInt(record.credits) > BigInt(t.credits)) return deny(403, `pledge layout: credits outside ${t.minCredits}..${t.credits}`, ctx)
    const coin = tx.outputs[0].satoshis ?? 0
    if (coin < Number(creditsCost(t, record.credits)) + 1) return deny(403, 'pledge layout: pledge coin below its share', ctx)
    const reason = providerReason(pool, policy)
    if (reason !== null) return deny(403, reason, ctx)
    if (tx.outputs[1].lockingScript.toHex() !== t.payScriptHex) return deny(403, "pledge fee is not paid to the pool's revenue key", ctx)
    if ((tx.outputs[1].satoshis ?? 0) < Number(t.feeSats)) return deny(403, 'pledge layout: fee below feeSats', ctx)
    const lineage = lineageReason(pool)
    if (lineage !== null) return deny(403, lineage, ctx)
    pledge = { poolId: pool.poolId, coinSats: coin, feeSats: tx.outputs[1].satoshis ?? 0, credits: record.credits }
    pledgePool = pool
  }

  // G7 + G8: classify outputs; a payment needs a proof the guard recomputes from the provider's identity key.
  const payees = context.payees ?? []
  const byVout = new Map<number, PayeeProof>()
  for (const p of payees) {
    if (p === null || typeof p !== 'object' || !Number.isInteger(p.vout) || typeof p.provider !== 'string' || typeof p.keyID !== 'string' || p.keyID.length === 0 || byVout.has(p.vout) || tx.outputs[p.vout] === undefined) {
      return deny(400, 'bad payee entry', ctx)
    }
    byVout.set(p.vout, p)
  }
  // H1: hot-wallet entries are well formed and name distinct outputs.
  const hotByVout = new Map<number, HotWalletProof>()
  for (const h of context.hotWallet ?? []) {
    if (h === null || typeof h !== 'object' || !Number.isInteger(h.vout) || tx.outputs[h.vout] === undefined || byVout.has(h.vout) || hotByVout.has(h.vout) ||
      typeof h.derivationPrefix !== 'string' || !BASE64_RE.test(h.derivationPrefix) || typeof h.derivationSuffix !== 'string' || !BASE64_RE.test(h.derivationSuffix)) {
      return deny(400, 'bad hot wallet entry', ctx)
    }
    hotByVout.set(h.vout, h)
  }
  let vaultReturn = 0
  let paid = 0
  let hot = 0
  let unlisted = 0
  for (const [vout, out] of tx.outputs.entries()) {
    const sats = out.satoshis ?? 0
    const hex = out.lockingScript.toHex()
    const proof = byVout.get(vout)
    const hotProof = hotByVout.get(vout)
    if (pledgePool !== undefined && vout === 1) {
      // P4 already proved out1 (the pool's revenue key); a redundant payee entry must agree.
      if (proof !== undefined && (proof.provider !== pledgePool.terms.provider || proof.keyID !== pledgePool.nonce)) return deny(403, `payee proof mismatch at vout ${vout}`, ctx)
      paid += sats
    } else if (proof !== undefined) {
      if (!policy.allowProviders.includes(proof.provider)) return deny(403, `provider not allowed: ${short(proof.provider)}`, ctx)
      let expected: string
      try { expected = providerPayScript(proof.provider, proof.keyID).toHex() } catch { return deny(400, 'bad payee entry', ctx) }
      if (expected !== hex) return deny(403, `payee proof mismatch at vout ${vout}`, ctx)
      paid += sats
    } else if (hotProof !== undefined) {
      // H2: the hot wallet is the vault's own agent, nobody else.
      if (hotWalletScript(agent, hotProof.derivationPrefix, hotProof.derivationSuffix).toHex() !== hex) return deny(403, `hot wallet proof mismatch at vout ${vout}`, ctx)
      hot += sats
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

  // Ledger keys: a spend of a pledge coin resolves that pledge's reservation (one key per pledge).
  const key = e.reservationKey ?? vaultOutpoint
  const reserve = pledge !== undefined ? reserveKey(vaultOutpoint) : undefined
  const exclude = [key, ...(reserve !== undefined ? [reserve] : [])]
  const outflow = Math.max(0, vaultIn - vaultReturn)

  // G11 / P5: per pool. A pledge commits fee + coin to its pool (all signed commitments to
  // that pool in the window count); a plain payment is capped per transaction.
  if (pledge !== undefined) {
    const before = e.poolSpent?.(owner, agent, pledge.poolId, exclude) ?? 0
    const committed = pledge.coinSats + paid // fee (and any other provider payment in this tx) + coin
    if (before + committed > policy.maxPerPoolSats) return deny(403, `maxPerPoolSats exceeded (pledge ${before > 0 ? `${before} + ` : ''}${committed} > ${policy.maxPerPoolSats})`, ctx)
  } else if (paid > policy.maxPerPoolSats) {
    return deny(403, `maxPerPoolSats exceeded (${paid} > ${policy.maxPerPoolSats})`, ctx)
  }

  // G12: rolling weekly cap on the vault's outflow; a pledge coin counts from pledge time.
  const windowSpent = e.spentInWindow(owner, agent, exclude)
  const committedOut = outflow + (pledge?.coinSats ?? 0)
  if (windowSpent + committedOut > policy.weeklyCapSats) return deny(403, `weeklyCapSats exceeded (${windowSpent} + ${committedOut} > ${policy.weeklyCapSats})`, ctx)

  // H3: rolling 24 h cap on hot-wallet top-ups.
  if (hot > 0) {
    const hotBefore = e.hotSpent?.(owner, agent, exclude) ?? 0
    if (hotBefore + hot > policy.hotWalletDailySats) return deny(403, `hotWalletDailySats exceeded (${hotBefore} + ${hot} > ${policy.hotWalletDailySats})`, ctx)
  }

  const entries: LedgerDraft[] = [{
    outpoint: key,
    outflowSats: outflow,
    kind: pledge !== undefined ? 'pledge' : e.reservationKey !== undefined ? 'resolve' : 'pay',
    ...(pledge !== undefined ? { poolId: pledge.poolId, poolSats: paid } : {}),
    ...(hot > 0 ? { hotSats: hot } : {})
  }]
  if (pledge !== undefined) entries.push({ outpoint: reserve!, outflowSats: pledge.coinSats, kind: 'reserve', poolId: pledge.poolId, poolSats: pledge.coinSats })

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
    payees: [...byVout.values()],
    hotSats: hot,
    ...(pledge !== undefined ? { pledge } : {}),
    entries
  }
}
