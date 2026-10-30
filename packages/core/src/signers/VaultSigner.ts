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
 * Agent flows (createAction + signAction, like A's buildPledge 'vault' path):
 *   adoptVaultOutput  take a vault output the owner funded into the agent's basket
 *   spendFromVault    pay from one vault UTXO; change goes back to the vault script
 */
import { Transaction, Utils, type CreateActionOutput, type SignActionResult, type UnlockingScript, type WalletInterface } from '../sdk'
import { VAULT_BASKET, VAULT_PROTOCOL, type InputSigner } from '../types'
import {
  VAULT_COSIGN_UNLOCK_LENGTH,
  VAULT_OWNER_UNLOCK_LENGTH,
  parseVaultLockingScript,
  toChecksigSignature,
  vaultCosignUnlock,
  vaultOwnerUnlock,
  vaultSighash,
  verifyVaultSignature,
  type VaultKeys
} from '../scripts/vault'

// ── guard protocol (MASTER §3.7) ─────────────────────────────────────────────

export type CosignKind = 'settle' | 'pay' | 'rail'

/** Proof that output `vout` pays `provider`: its script is P2PKH(derive([1,'agentcoop provider'], keyID, provider, 'anyone')). */
export interface PayeeProof {
  vout: number
  provider: string
  keyID: string
}

export interface CosignContext {
  kind: CosignKind
  poolId?: string
  expectedCredits?: string
  tokenId?: string
  payees?: PayeeProof[]
}

export interface CosignRequest {
  /** AtomicBEEF of the transaction to sign, with every input's source transaction (number[] or hex). */
  txBEEF: number[] | string
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

// ── signers ──────────────────────────────────────────────────────────────────

function vaultKeysOfInput (tx: Transaction, inputIndex: number): VaultKeys {
  const input = tx.inputs[inputIndex]
  const source = input?.sourceTransaction?.outputs[input.sourceOutputIndex]
  if (source === undefined) throw new Error(`input ${inputIndex} has no source output`)
  const keys = parseVaultLockingScript(source.lockingScript)
  if (keys === null) throw new Error(`input ${inputIndex} is not a vault output`)
  return keys
}

async function signVaultInput (wallet: WalletInterface, sighash: number[], vaultId: string, originator?: string): Promise<number[]> {
  const { signature } = await wallet.createSignature({
    hashToDirectlySign: sighash,
    protocolID: VAULT_PROTOCOL,
    keyID: vaultId,
    counterparty: 'anyone'
  }, originator)
  return toChecksigSignature(signature)
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
  /** SettlementPlan for context.kind 'settle' (D-P2). */
  plan?: unknown
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

    const sighash = vaultSighash(tx, inputIndex)
    const sigAgent = await signVaultInput(this.wallet, sighash, vaultId, originator)
    const context = typeof this.opts.context === 'function' ? this.opts.context(tx, inputIndex) : this.opts.context
    const { signatureHex } = await this.opts.cosign({
      txBEEF: Utils.toHex(tx.toAtomicBEEF(true)),
      ...(this.opts.plan !== undefined ? { plan: this.opts.plan } : {}),
      inputIndex,
      agent,
      agentSignatureHex: Utils.toHex(sigAgent),
      context
    })
    const sigGuard = Utils.toArray(signatureHex, 'hex')
    if (!verifyVaultSignature(keys.guardPub, sighash, sigGuard)) throw new Error('guard returned a signature that does not verify')
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
 */
export async function spendFromVault (wallet: WalletInterface, args: {
  vaultId: string
  utxo: VaultUtxo
  outputs: VaultSpendOutput[]
  cosign: Cosigner
  description?: string
  originator?: string
}): Promise<VaultSpendResult> {
  const { vaultId, utxo, outputs, originator } = args
  const paid = outputs.reduce((s, o) => s + o.satoshis, 0)
  const change = utxo.satoshis - paid
  if (change < 0) throw new Error(`vault UTXO ${utxo.outpoint} holds ${utxo.satoshis} sats, outputs need ${paid}`)
  const all: CreateActionOutput[] = outputs.map(o => ({ lockingScript: o.lockingScript, satoshis: o.satoshis, outputDescription: o.outputDescription ?? 'AgentCoop vault payment' }))
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
  try {
    const tx = Transaction.fromAtomicBEEF(signable.tx)
    const [txid, vout] = utxo.outpoint.split('.')
    const vi = tx.inputs.findIndex(i => (i.sourceTXID ?? i.sourceTransaction?.id('hex')) === txid && i.sourceOutputIndex === Number(vout))
    if (vi < 0) throw new Error('vault input missing from the signable transaction')
    all.forEach((o, i) => { if (tx.outputs[i]?.lockingScript.toHex() !== o.lockingScript) throw new Error(`output ${i} moved`) })
    const payees: PayeeProof[] = outputs.flatMap((o, i) => o.payee !== undefined ? [{ vout: i, ...o.payee }] : [])
    const signer = new VaultSigner(wallet, { vaultId, cosign: args.cosign, context: { kind: 'pay', payees }, originator })
    const unlockingScript = await signer.sign(tx, vi)
    const signed = broadcastResult(await wallet.signAction({ reference: signable.reference, spends: { [vi]: { unlockingScript: unlockingScript.toHex() } } }, originator))
    return { ...signed, ...(change > 0 ? { changeVout: outputs.length } : {}) }
  } catch (e) {
    await wallet.abortAction({ reference: signable.reference }, originator).catch(() => {})
    throw e
  }
}
