/**
 * Mandate Vault signers (MASTER §3.3 InputSigner, plan/phases/D-P1.md). Track D.
 *
 *   VaultSigner       agent + guard 2-of-2: the agent signs with its own wallet,
 *                     the guard co-signs over POST /cosign after its policy checks.
 *   VaultOwnerSigner  the owner's unilateral path (OP_IF branch).
 *
 * Both sign SIGHASH_ALL|FORKID over the whole vault script with the vault key
 * ([1,'agentcoop vault'], keyID = vaultId, counterparty 'anyone'). `sign(tx, i)`
 * needs the source transaction of EVERY input: the guard computes the fee and
 * the vault's outflow from them.
 *
 * Agent flows (createAction + signAction):
 *   adoptVaultOutput           take a vault output the owner funded into the agent's basket
 *   spendFromVault             pay from one vault UTXO; change goes back to the vault script
 *   pledgeFromVault            a vault pledge in A.3.1's layout (guard 2.1b), reference for buildPledge(…,'vault')
 *   cancelVaultPledge          the pledge coin back into the vault
 *   internalizeVaultSettlement after a settlement: change into the vault basket, pledge coin dropped
 *   topUpHotWallet             vault → the agent's default basket, under hotWalletDailySats (D-P2.2)
 *   adoptVaultCredits / listVaultCredits   vault-locked credits (A 5.3) in their own basket (D-P2b)
 *
 * Inputs may also be vault-locked credits (A 5.1: a BSV-21 inscription in front of the
 * vault script): the keys come from `vaultKeysOfScript`. A credit listing signs with
 * SINGLE|ANYONECANPAY|FORKID (`scope`, guard kind 'list').
 */
import { Random, Transaction, Utils, type CreateActionOutput, type SignActionResult, type UnlockingScript, type WalletInterface } from '../sdk'
import { AgentCoopError } from '../errors'
import { buildOpReturn } from '../scripts/opreturn'
import { decodeBsv21Owned, vaultKeysOfScript } from '../scripts/creditLock'
import { pledgeAmount } from '../pool/pledge'
import { validateTerms } from '../pool/terms'
import { coopOutpoint, toWalletOutpoint } from '../util/outpoint'
import { PLEDGE_BASKET, VAULT_BASKET, VAULT_PROTOCOL, type InputSigner, type PledgeRecord, type PoolTerms, type SettlementPlan } from '../types'
import {
  ANYONE_IDENTITY_KEY,
  VAULT_COSIGN_UNLOCK_LENGTH,
  VAULT_OWNER_UNLOCK_LENGTH,
  hotWalletScript,
  parseVaultLockingScript,
  toChecksigSignature,
  vaultCosignUnlock,
  vaultOwnerUnlock,
  vaultSighash,
  verifyVaultSignature,
  type VaultKeys
} from '../scripts/vault'

// ── guard protocol (MASTER §3.7) ─────────────────────────────────────────────

export type CosignKind = 'settle' | 'pay' | 'rail' | 'redeem' | 'list'

/** D-P2b 'redeem': output `vout` sends credits to `provider`'s token address `receivePkh(provider, index)` (kit addresses). */
export interface CreditPayeeProof {
  vout: number
  provider: string
  index: number
}

/** Proof that output `vout` pays `provider`: its script is P2PKH(derive([1,'agentcoop provider'], keyID, provider, 'anyone')). */
export interface PayeeProof {
  vout: number
  provider: string
  keyID: string
}

/** Proof that output `vout` is a BRC-29 payment from 'anyone' to the vault's own agent (its hot wallet, D-P2.2). */
export interface HotWalletProof {
  vout: number
  derivationPrefix: string
  derivationSuffix: string
}

export interface CosignContext {
  kind: CosignKind
  /** settle: the plan's pool (required). */
  poolId?: string
  /** settle: cross-checks against the pledge record on chain. */
  expectedCredits?: string
  tokenId?: string
  payees?: PayeeProof[]
  /** pay, when the transaction is a vault pledge: the pool transaction (AtomicBEEF, BEEF or raw; hex or bytes). Else the guard fetches it. */
  poolBEEF?: number[] | string
  /** pay: outputs that top up the agent's hot wallet. */
  hotWallet?: HotWalletProof[]
  /** rail: the Coop Rail swap whose HTLC is claimed (keyID of the rail keys, D-P3). */
  swapId?: string
  /** redeem: credit outputs to allowed providers (D-P2b). */
  creditPayees?: CreditPayeeProof[]
}

export interface CosignRequest {
  /** AtomicBEEF of the transaction to sign, with every input's source transaction (number[] or hex). Not sent for 'settle'. */
  txBEEF?: number[] | string
  /** 'settle': the SettlementPlan; the guard builds the transaction from it (planTransaction). */
  plan?: unknown
  inputIndex: number
  /** The agent's identity key. */
  agent: string
  /** The agent's signature over the same sighash, checksig format (DER ‖ 0x41), hex. */
  agentSignatureHex: string
  context: CosignContext
}

export interface CosignResponse {
  /** Checksig format (DER ‖ 0x41), hex. */
  signatureHex: string
  guardPub: string
}

export type Cosigner = (req: CosignRequest) => Promise<CosignResponse>

export class CosignRejected extends Error {
  constructor (readonly status: number, readonly reason: string) {
    super(`guard refused (${status}): ${reason}`)
    this.name = 'CosignRejected'
  }
}

/** Cosigner that calls a guard over HTTP (`POST {guardUrl}/cosign`). */
export function httpCosigner (guardUrl: string): Cosigner {
  const url = `${guardUrl.replace(/\/+$/, '')}/cosign`
  return async (req) => {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req) })
    const body = await res.json().catch(() => ({})) as Partial<CosignResponse> & { reason?: string }
    if (!res.ok || typeof body.signatureHex !== 'string') throw new CosignRejected(res.status, body.reason ?? `HTTP ${res.status}`)
    return { signatureHex: body.signatureHex, guardPub: String(body.guardPub) }
  }
}

/**
 * The coordinator's call for a lighthouse input (Track A 5.5–5.7, guard D-P2c): `POST {guardUrl}/cosign`
 * with `context.kind: 'lighthouse'`. The guard derives the offer from the plan itself and runs
 * cosignLighthouse; returns the complete unlocking script (human + guard). Throws CosignRejected.
 */
export async function lighthouseCosign (guardUrl: string, req: { plan: SettlementPlan, inputIndex: number, pledge: unknown }): Promise<string> {
  const res = await fetch(`${guardUrl.replace(/\/+$/, '')}/cosign`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ context: { kind: 'lighthouse' }, plan: req.plan, inputIndex: req.inputIndex, pledge: req.pledge })
  })
  const body = await res.json().catch(() => ({})) as { unlockingScriptHex?: string, reason?: string }
  if (!res.ok || typeof body.unlockingScriptHex !== 'string') throw new CosignRejected(res.status, body.reason ?? `HTTP ${res.status}`)
  return body.unlockingScriptHex
}

// ── signers ──────────────────────────────────────────────────────────────────

/** The vault keys of an input: a plain vault output or vault-locked credits (A 5.1). */
function vaultKeysOfInput (tx: Transaction, inputIndex: number): VaultKeys {
  const input = tx.inputs[inputIndex]
  const source = input?.sourceTransaction?.outputs[input.sourceOutputIndex]
  if (source === undefined) throw new Error(`input ${inputIndex} has no source output`)
  const keys = vaultKeysOfScript(source.lockingScript)
  if (keys === null) throw new Error(`input ${inputIndex} is not a vault output`)
  return keys
}

async function signVaultInput (wallet: WalletInterface, sighash: number[], vaultId: string, originator?: string, scope?: number): Promise<number[]> {
  const { signature } = await wallet.createSignature({
    hashToDirectlySign: sighash,
    protocolID: VAULT_PROTOCOL,
    keyID: vaultId,
    counterparty: 'anyone'
  }, originator)
  return toChecksigSignature(signature, scope)
}

async function myVaultPub (wallet: WalletInterface, vaultId: string, originator?: string): Promise<string> {
  const { publicKey } = await wallet.getPublicKey({ protocolID: VAULT_PROTOCOL, keyID: vaultId, counterparty: 'anyone', forSelf: true }, originator)
  return publicKey
}

export interface VaultSignerOptions {
  vaultId: string
  cosign: Cosigner
  /** Sent to the guard; a function gets the transaction being signed. */
  context: CosignContext | ((tx: Transaction, inputIndex: number) => CosignContext)
  /** SettlementPlan for context.kind 'settle': sent instead of the transaction. */
  plan?: unknown
  /** Sighash scope; default ALL|FORKID. A credit listing (kind 'list') uses VAULT_LIST_SIGHASH (0xC3). */
  scope?: number
  originator?: string
}

/** Agent + guard 2-of-2: `OP_0 <sigAgent> <sigGuard> OP_0`. Throws CosignRejected when the guard refuses. */
export class VaultSigner implements InputSigner {
  readonly unlockingScriptLength = VAULT_COSIGN_UNLOCK_LENGTH

  constructor (private readonly wallet: WalletInterface, private readonly opts: VaultSignerOptions) {}

  async sign (tx: Transaction, inputIndex: number): Promise<UnlockingScript> {
    const { vaultId, originator } = this.opts
    const keys = vaultKeysOfInput(tx, inputIndex)
    if (await myVaultPub(this.wallet, vaultId, originator) !== keys.agentPub) throw new Error(`input ${inputIndex} is not locked to this agent's key for vault ${vaultId}`)
    const { publicKey: agent } = await this.wallet.getPublicKey({ identityKey: true }, originator)

    const { scope } = this.opts
    const sighash = vaultSighash(tx, inputIndex, scope)
    const sigAgent = await signVaultInput(this.wallet, sighash, vaultId, originator, scope)
    const context = typeof this.opts.context === 'function' ? this.opts.context(tx, inputIndex) : this.opts.context
    const { signatureHex } = await this.opts.cosign({
      // settle: the guard rebuilds the transaction from the plan itself
      ...(this.opts.plan !== undefined ? { plan: this.opts.plan } : { txBEEF: Utils.toHex(tx.toAtomicBEEF(true)) }),
      inputIndex,
      agent,
      agentSignatureHex: Utils.toHex(sigAgent),
      context
    })
    const sigGuard = Utils.toArray(signatureHex, 'hex')
    if (!verifyVaultSignature(keys.guardPub, sighash, sigGuard, scope)) throw new Error('guard returned a signature that does not verify')
    return vaultCosignUnlock(sigAgent, sigGuard)
  }
}

/** The owner's path: `<sigOwner> OP_1`. Needs no guard and no agent. */
export class VaultOwnerSigner implements InputSigner {
  readonly unlockingScriptLength = VAULT_OWNER_UNLOCK_LENGTH

  constructor (private readonly wallet: WalletInterface, private readonly opts: { vaultId: string, originator?: string }) {}

  async sign (tx: Transaction, inputIndex: number): Promise<UnlockingScript> {
    const { vaultId, originator } = this.opts
    const keys = vaultKeysOfInput(tx, inputIndex)
    if (await myVaultPub(this.wallet, vaultId, originator) !== keys.ownerPub) throw new Error(`input ${inputIndex} is not locked to this owner's key for vault ${vaultId}`)
    return vaultOwnerUnlock(await signVaultInput(this.wallet, vaultSighash(tx, inputIndex), vaultId, originator))
  }
}

// ── agent flows ──────────────────────────────────────────────────────────────

export interface VaultUtxo {
  /** "txid.vout" */
  outpoint: string
  satoshis: number
  lockingScriptHex: string
  /** BEEF (or AtomicBEEF) holding the source transaction. */
  beef: number[]
}

export const vaultTag = (vaultId: string): string => `vault:${vaultId}`

const instructions = (vaultId: string, role: 'owner' | 'agent'): string =>
  JSON.stringify({ vaultId, role, protocolID: VAULT_PROTOCOL, keyID: vaultId, counterparty: 'anyone' })

/** Track a vault output (e.g. the owner's funding, handed over as AtomicBEEF) in the agent's `agentcoop vault` basket. */
export async function adoptVaultOutput (wallet: WalletInterface, vaultId: string, tx: number[], vout: number, originator?: string): Promise<void> {
  const t = Transaction.fromAtomicBEEF(tx)
  if (parseVaultLockingScript(t.outputs[vout]?.lockingScript ?? '') === null) throw new Error(`output ${vout} of ${t.id('hex')} is not a vault output`)
  await wallet.internalizeAction({
    tx,
    outputs: [{ outputIndex: vout, protocol: 'basket insertion', insertionRemittance: { basket: VAULT_BASKET, customInstructions: instructions(vaultId, 'agent'), tags: [vaultTag(vaultId)] } }],
    description: 'Adopt AgentCoop vault output'
  }, originator)
}

/** Spendable vault UTXOs the agent's wallet tracks for `vaultId`, largest first. */
export async function listVaultUtxos (wallet: WalletInterface, vaultId: string, originator?: string): Promise<VaultUtxo[]> {
  const { outputs, BEEF } = await wallet.listOutputs({ basket: VAULT_BASKET, tags: [vaultTag(vaultId)], include: 'entire transactions', limit: 1000 }, originator)
  if (BEEF === undefined) return []
  const beef = Array.from(BEEF)
  const out: VaultUtxo[] = []
  for (const o of outputs) {
    if (!o.spendable) continue
    const [txid, vout] = o.outpoint.split('.')
    const script = Transaction.fromBEEF(beef, txid).outputs[Number(vout)].lockingScript.toHex()
    out.push({ outpoint: o.outpoint, satoshis: o.satoshis, lockingScriptHex: script, beef })
  }
  return out.sort((a, b) => b.satoshis - a.satoshis)
}

// ── vault-locked credits (A 5.1–5.3; D-P2b) ──────────────────────────────────

/** Vault-locked credits live apart from the vault's sats, so spendFromVault never picks one for a fee. */
export const VAULT_CREDITS_BASKET = 'agentcoop vault credits'

export interface VaultCreditUtxo extends VaultUtxo {
  tokenId: string
  amount: bigint
}

/** Track vault-locked credits of `vaultId` (e.g. from a settlement with creditLock 'vault') in the agent's credits basket. */
export async function adoptVaultCredits (wallet: WalletInterface, vaultId: string, tx: number[], vout: number, originator?: string): Promise<VaultCreditUtxo> {
  const t = Transaction.fromAtomicBEEF(tx)
  const txid = t.id('hex')
  const out = t.outputs[vout]
  const d = out === undefined ? null : decodeBsv21Owned(out.lockingScript)
  if (d === null || d.owner.kind !== 'vault' || d.op === 'burn') throw new Error(`output ${vout} of ${txid} is not vault-locked credits`)
  if (vaultKeysOfScript(out.lockingScript)?.agentPub !== await myVaultPub(wallet, vaultId, originator)) throw new Error(`output ${vout} of ${txid} is locked to another vault`)
  const tokenId = d.op === 'deploy+mint' ? coopOutpoint(txid, vout) : d.id!
  await wallet.internalizeAction({
    tx,
    outputs: [{
      outputIndex: vout,
      protocol: 'basket insertion',
      insertionRemittance: { basket: VAULT_CREDITS_BASKET, customInstructions: JSON.stringify({ ...JSON.parse(instructions(vaultId, 'agent')), tokenId, amt: d.amount.toString() }), tags: [vaultTag(vaultId), `token:${tokenId}`] }
    }],
    description: 'Adopt AgentCoop vault credits'
  }, originator)
  return { outpoint: `${txid}.${vout}`, satoshis: out.satoshis ?? 0, lockingScriptHex: out.lockingScript.toHex(), beef: tx, tokenId, amount: d.amount }
}

/** Spendable vault-locked credits the agent's wallet tracks for `vaultId` (optionally one token), largest first. */
export async function listVaultCredits (wallet: WalletInterface, vaultId: string, tokenId?: string, originator?: string): Promise<VaultCreditUtxo[]> {
  const tags = [vaultTag(vaultId), ...(tokenId !== undefined ? [`token:${tokenId}`] : [])]
  const { outputs, BEEF } = await wallet.listOutputs({ basket: VAULT_CREDITS_BASKET, tags, tagQueryMode: 'all', include: 'entire transactions', limit: 1000 }, originator)
  if (BEEF === undefined) return []
  const beef = Array.from(BEEF)
  const out: VaultCreditUtxo[] = []
  for (const o of outputs) {
    if (!o.spendable) continue
    const [txid, vout] = o.outpoint.split('.')
    const script = Transaction.fromBEEF(beef, txid).outputs[Number(vout)].lockingScript
    const d = decodeBsv21Owned(script)
    if (d === null || d.owner.kind !== 'vault') continue
    out.push({ outpoint: o.outpoint, satoshis: o.satoshis, lockingScriptHex: script.toHex(), beef, tokenId: d.op === 'deploy+mint' ? coopOutpoint(txid, Number(vout)) : d.id!, amount: d.amount })
  }
  return out.sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0))
}

/**
 * The signed transaction, or an error if the wallet could not broadcast it.
 * wallet-toolbox's signAction does not throw when the broadcast fails (e.g. a
 * double spend): it reports `sendWithResults[].status = 'failed'`.
 */
export function broadcastResult (signed: SignActionResult): { txid: string, tx: number[] } {
  if (signed.txid === undefined || signed.tx === undefined) throw new Error('signAction returned no transaction')
  const failed = signed.sendWithResults?.find(r => r.status === 'failed')
  if (failed !== undefined) throw new Error(`broadcast of ${failed.txid} failed (double spend or invalid transaction)`)
  return { txid: signed.txid, tx: Array.from(signed.tx) }
}

export interface VaultSpendOutput {
  lockingScript: string
  satoshis: number
  outputDescription?: string
  /** Set for a payment to a provider's revenue key: becomes a PayeeProof for the guard. */
  payee?: { provider: string, keyID: string }
  /** Set for a hot-wallet top-up (BRC-29 from 'anyone' to the agent): becomes a HotWalletProof. */
  hot?: { derivationPrefix: string, derivationSuffix: string }
  /** Track the output in the agent's wallet (e.g. a vault pledge coin in 'agentcoop'). */
  basket?: string
  customInstructions?: string
  tags?: string[]
}

export interface VaultSpendResult {
  txid: string
  /** AtomicBEEF of the broadcast transaction. */
  tx: number[]
  /** Output index of the change back to the vault, if any. */
  changeVout?: number
}

/**
 * Pay from ONE vault UTXO (the guard accepts one input per vault per tx).
 * Outputs keep their order (randomizeOutputs: false); the rest of the UTXO
 * returns to the vault script. The agent's wallet adds its own input for the
 * miner fee. On a guard refusal the action is aborted and CosignRejected thrown.
 * If the broadcast fails (typically: the owner already withdrew the UTXO), the
 * UTXO is dropped from the agent's basket (relinquishOutput); `npm run adopt`
 * takes it back if it turns out to be unspent.
 */
export async function spendFromVault (wallet: WalletInterface, args: {
  vaultId: string
  utxo: VaultUtxo
  outputs: VaultSpendOutput[]
  cosign: Cosigner
  description?: string
  /** Extra context for the guard (e.g. poolBEEF for a pledge). */
  context?: Omit<CosignContext, 'kind' | 'payees' | 'hotWallet'>
  originator?: string
}): Promise<VaultSpendResult> {
  const { vaultId, utxo, originator } = args
  const paid = args.outputs.reduce((s, o) => s + o.satoshis, 0)
  const change = utxo.satoshis - paid
  if (change < 0) throw new Error(`vault UTXO ${utxo.outpoint} holds ${utxo.satoshis} sats, outputs need ${paid}`)
  const all: CreateActionOutput[] = args.outputs.map(o => ({
    lockingScript: o.lockingScript,
    satoshis: o.satoshis,
    outputDescription: o.outputDescription ?? 'AgentCoop vault payment',
    ...(o.basket !== undefined ? { basket: o.basket } : {}),
    ...(o.customInstructions !== undefined ? { customInstructions: o.customInstructions } : {}),
    ...(o.tags !== undefined ? { tags: o.tags } : {})
  }))
  if (change > 0) {
    all.push({ lockingScript: utxo.lockingScriptHex, satoshis: change, outputDescription: 'AgentCoop vault change', basket: VAULT_BASKET, customInstructions: instructions(vaultId, 'agent'), tags: [vaultTag(vaultId)] })
  }
  const created = await wallet.createAction({
    description: args.description ?? 'AgentCoop vault payment',
    inputBEEF: utxo.beef,
    inputs: [{ outpoint: utxo.outpoint, unlockingScriptLength: VAULT_COSIGN_UNLOCK_LENGTH, inputDescription: 'AgentCoop vault' }],
    outputs: all,
    options: { randomizeOutputs: false, acceptDelayedBroadcast: false, signAndProcess: false }
  }, originator)
  const signable = created.signableTransaction
  if (signable === undefined) throw new Error('createAction returned no signable transaction')
  let signed: SignActionResult
  try {
    const tx = Transaction.fromAtomicBEEF(signable.tx)
    const [txid, vout] = utxo.outpoint.split('.')
    const vi = tx.inputs.findIndex(i => (i.sourceTXID ?? i.sourceTransaction?.id('hex')) === txid && i.sourceOutputIndex === Number(vout))
    if (vi < 0) throw new Error('vault input missing from the signable transaction')
    all.forEach((o, i) => { if (tx.outputs[i]?.lockingScript.toHex() !== o.lockingScript) throw new Error(`output ${i} moved`) })
    const payees: PayeeProof[] = args.outputs.flatMap((o, i) => o.payee !== undefined ? [{ vout: i, ...o.payee }] : [])
    const hotWallet: HotWalletProof[] = args.outputs.flatMap((o, i) => o.hot !== undefined ? [{ vout: i, ...o.hot }] : [])
    const context: CosignContext = { ...args.context, kind: 'pay', payees, ...(hotWallet.length > 0 ? { hotWallet } : {}) }
    const signer = new VaultSigner(wallet, { vaultId, cosign: args.cosign, context, originator })
    const unlockingScript = await signer.sign(tx, vi)
    signed = await wallet.signAction({ reference: signable.reference, spends: { [vi]: { unlockingScript: unlockingScript.toHex() } } }, originator)
  } catch (e) {
    await wallet.abortAction({ reference: signable.reference }, originator).catch(() => {})
    throw e
  }
  try {
    const result = broadcastResult(signed)
    return { ...result, ...(change > 0 ? { changeVout: args.outputs.length } : {}) }
  } catch (e) {
    await wallet.relinquishOutput({ basket: VAULT_BASKET, output: utxo.outpoint }, originator).catch(() => {})
    throw new Error(`${(e as Error).message}; ${utxo.outpoint} dropped from the agent's '${VAULT_BASKET}' basket (npm run adopt takes it back if it is still unspent)`)
  }
}

// ── vault pledges (2.1b; A.3.1 layout) ───────────────────────────────────────

/** customInstructions of a vault pledge coin in the agent's 'agentcoop' basket. */
export interface VaultPledgeInstructions {
  signer: 'vault'
  vaultId: string
  poolId: string
  protocolID: typeof VAULT_PROTOCOL
  keyID: string
  counterparty: 'anyone'
}

export interface VaultPledge {
  txid: string
  /** "txid_vout" of the pledge coin (always vout 0). */
  outpoint: string
  record: PledgeRecord
  satoshis: number
  /** AtomicBEEF: submit it to tm_agentcoop. */
  beef: number[]
  instructions: VaultPledgeInstructions
}

/**
 * Pledge to a pool from the vault, in A.3.1's layout so the guard can check it at
 * pledge time (D-P2 §7.2): out0 pledge coin on the vault script, out1 feeSats →
 * payScriptHex, out2 OP_RETURN pledge { signer:'vault' }, then change to the vault.
 * The coin stays spendable by the owner. One active pledge per 'agentcoop' basket.
 * `poolBEEF` (the pool transaction, e.g. from the overlay's pool lookup) saves the guard a fetch.
 */
export async function pledgeFromVault (wallet: WalletInterface, args: {
  vaultId: string
  utxo: VaultUtxo
  terms: PoolTerms
  credits: string
  tokenIndex: number
  cosign: Cosigner
  poolBEEF?: number[] | string
  bufferSats?: number
  allowMultiple?: boolean
  originator?: string
  /** A 5.3: settle my credits onto the vault script instead of my P2PKH receive address. */
  creditLock?: 'vault'
}): Promise<VaultPledge> {
  const { terms, credits, vaultId, originator } = args
  validateTerms(terms)
  if (BigInt(credits) < BigInt(terms.minCredits) || BigInt(credits) > BigInt(terms.credits)) throw new AgentCoopError('BAD_PLEDGE', `credits must be in ${terms.minCredits}..${terms.credits}`)
  if (args.allowMultiple !== true) {
    const active = await wallet.listOutputs({ basket: PLEDGE_BASKET, includeCustomInstructions: true, limit: 1000 }, originator)
    const isPledge = (ci?: string): boolean => { try { return ci === undefined || JSON.parse(ci).change !== true } catch { return true } }
    if (active.outputs.some(o => o.spendable && isPledge(o.customInstructions))) throw new AgentCoopError('BAD_PLEDGE', `an active pledge already exists in '${PLEDGE_BASKET}' (one at a time)`)
  }
  const { publicKey: participant } = await wallet.getPublicKey({ identityKey: true }, originator)
  const satoshis = pledgeAmount(terms, credits, args.bufferSats)
  const record: PledgeRecord = { v: '1', poolId: terms.poolId, credits, participant, tokenIndex: String(args.tokenIndex), signer: 'vault', ...(args.creditLock === 'vault' ? { creditLock: 'vault' as const } : {}) }
  const ins: VaultPledgeInstructions = { signer: 'vault', vaultId, poolId: terms.poolId, protocolID: VAULT_PROTOCOL, keyID: vaultId, counterparty: 'anyone' }
  const res = await spendFromVault(wallet, {
    vaultId,
    utxo: args.utxo,
    cosign: args.cosign,
    description: 'AgentCoop: pledge to pool from vault',
    ...(args.poolBEEF !== undefined ? { context: { poolBEEF: args.poolBEEF } } : {}),
    outputs: [
      { lockingScript: args.utxo.lockingScriptHex, satoshis, outputDescription: 'AgentCoop pledge coin (vault)', basket: PLEDGE_BASKET, customInstructions: JSON.stringify(ins), tags: ['agentcoop', `pool:${terms.poolId}`, vaultTag(vaultId)] },
      { lockingScript: terms.payScriptHex, satoshis: Number(terms.feeSats), outputDescription: 'AgentCoop registration fee' },
      { lockingScript: buildOpReturn('pledge', record).toHex(), satoshis: 0, outputDescription: 'AgentCoop pledge record' }
    ],
    originator
  })
  return { txid: res.txid, outpoint: coopOutpoint(res.txid, 0), record, satoshis, beef: res.tx, instructions: ins }
}

/** Withdraw a vault pledge: the whole coin returns to the vault script (guard: resolves the pledge's reservation). */
export async function cancelVaultPledge (wallet: WalletInterface, pledge: Pick<VaultPledge, 'outpoint' | 'beef' | 'instructions'>, cosign: Cosigner, originator?: string): Promise<VaultSpendResult> {
  const tx = Transaction.fromAtomicBEEF(pledge.beef)
  const utxo: VaultUtxo = { outpoint: toWalletOutpoint(pledge.outpoint), satoshis: tx.outputs[0].satoshis ?? 0, lockingScriptHex: tx.outputs[0].lockingScript.toHex(), beef: pledge.beef }
  const res = await spendFromVault(wallet, { vaultId: pledge.instructions.vaultId, utxo, outputs: [], cosign, description: 'AgentCoop: withdraw vault pledge', originator })
  await wallet.relinquishOutput({ basket: PLEDGE_BASKET, output: utxo.outpoint }, originator).catch(() => undefined)
  return res
}

/**
 * After a settlement with a vault pledge: the change (back on the vault script)
 * goes into the agent's vault basket, the spent pledge coin leaves 'agentcoop'.
 * Credits arrive via TokenKit.sync() as for any participant.
 */
export async function internalizeVaultSettlement (wallet: WalletInterface, tx: Transaction, plan: SettlementPlan, myOutpoint: string, vaultId: string, originator?: string): Promise<void> {
  const j = plan.participants.findIndex(p => p.outpoint === myOutpoint)
  if (j === -1) throw new AgentCoopError('BAD_PLAN', `${myOutpoint} is not in the plan`)
  const vout = plan.participants.length + 1 + j
  if (parseVaultLockingScript(tx.outputs[vout]?.lockingScript ?? '') === null) throw new AgentCoopError('BAD_PLAN', `change ${vout} is not on a vault script`)
  await wallet.internalizeAction({
    tx: tx.toAtomicBEEF(),
    outputs: [{ outputIndex: vout, protocol: 'basket insertion', insertionRemittance: { basket: VAULT_BASKET, customInstructions: instructions(vaultId, 'agent'), tags: [vaultTag(vaultId)] } }],
    labels: ['agentcoop'],
    description: 'AgentCoop settlement change (vault)'
  }, originator)
  await wallet.relinquishOutput({ basket: PLEDGE_BASKET, output: toWalletOutpoint(myOutpoint) }, originator).catch(() => undefined)
}

// ── hot wallet (D-P2.2) ──────────────────────────────────────────────────────

/**
 * Move `satoshis` from the vault to the agent's own `default` basket (its hot
 * wallet for retail 402 calls), as a BRC-29 payment from 'anyone' that the guard
 * can attribute to this agent; capped by the owner's hotWalletDailySats.
 */
export async function topUpHotWallet (wallet: WalletInterface, args: {
  vaultId: string
  utxo: VaultUtxo
  satoshis: number
  cosign: Cosigner
  originator?: string
}): Promise<VaultSpendResult & { satoshis: number }> {
  const { originator } = args
  if (!Number.isSafeInteger(args.satoshis) || args.satoshis < 1) throw new Error(`invalid amount: ${args.satoshis}`)
  const { publicKey: me } = await wallet.getPublicKey({ identityKey: true }, originator)
  const derivationPrefix = Utils.toBase64(Random(16))
  const derivationSuffix = Utils.toBase64(Random(16))
  const res = await spendFromVault(wallet, {
    vaultId: args.vaultId,
    utxo: args.utxo,
    cosign: args.cosign,
    description: 'AgentCoop: hot wallet top-up',
    outputs: [{ lockingScript: hotWalletScript(me, derivationPrefix, derivationSuffix).toHex(), satoshis: args.satoshis, outputDescription: 'AgentCoop hot wallet', hot: { derivationPrefix, derivationSuffix } }],
    originator
  })
  await wallet.internalizeAction({
    tx: res.tx,
    outputs: [{ outputIndex: 0, protocol: 'wallet payment', paymentRemittance: { derivationPrefix, derivationSuffix, senderIdentityKey: ANYONE_IDENTITY_KEY } }],
    description: 'AgentCoop hot wallet top-up'
  }, originator)
  return { ...res, satoshis: args.satoshis }
}
