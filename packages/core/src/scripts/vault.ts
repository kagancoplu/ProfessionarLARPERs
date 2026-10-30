/**
 * Mandate Vault script (FINAL-IDEA §4.9, plan/phases/D-P1.md §6). Skeleton and
 * signature by Track A (MASTER-PLAN §3.4); body, helpers and mainnet validation
 * (test 5) by Track D.
 *
 *   OP_IF <ownerPub> OP_CHECKSIG OP_ELSE OP_2 <agentPub> <guardPub> OP_2 OP_CHECKMULTISIG OP_ENDIF
 *
 *   owner (any time, alone):  <sigOwner> OP_1
 *   agent + guard (2-of-2):   OP_0 <sigAgent> <sigGuard> OP_0
 *
 * Every key is derived (protocol [1,'agentcoop vault'], keyID = vaultId,
 * counterparty 'anyone'), never an identity key (guide §5.1). With 'anyone',
 * the agent's and the guard's vault keys follow from their identity keys alone,
 * so the owner CLI, the guard and the overlay rebuild the same script from the
 * vault record (three identity keys + vaultId).
 */
import {
  BigNumber,
  ECDSA,
  Hash,
  KeyDeriver,
  LockingScript,
  OP,
  P2PKH,
  PrivateKey,
  PublicKey,
  Random,
  Script,
  Signature,
  TransactionSignature,
  UnlockingScript,
  Utils,
  type Transaction
} from '../sdk'
import { PROVIDER_PROTOCOL, SIGHASH_ALL_FORKID, VAULT_PROTOCOL } from '../types'
import { buildOpReturn } from './opreturn'
import { BRC29_PROTOCOL } from '../kit/payments'

/** Sighash for every vault signature: SIGHASH_ALL | SIGHASH_FORKID (0x41). */
export const VAULT_SIGHASH = SIGHASH_ALL_FORKID
/** <sig ≤73> push (≤74) + OP_1. Measured: 74. */
export const VAULT_OWNER_UNLOCK_LENGTH = 75
/** OP_0 + 2 × <sig ≤73> push (≤148) + OP_0. Measured: 147. */
export const VAULT_COSIGN_UNLOCK_LENGTH = 150
export const VAULT_SCRIPT_LENGTH = 109

export interface VaultKeys {
  ownerPub: string
  agentPub: string
  guardPub: string
}

/** OP_RETURN `agentcoop vault` record (D-P1 §6.4). Identity keys, not derived keys. */
export interface VaultRecord {
  v: '1'
  vaultId: string
  owner: string
  agent: string
  guard: string
}

const VAULT_SCRIPT_RE = /^6321(0[23][0-9a-f]{64})ac675221(0[23][0-9a-f]{64})21(0[23][0-9a-f]{64})52ae68$/
const VAULT_ID_RE = /^[0-9a-f]{32}$/
const IDENTITY_RE = /^0[23][0-9a-f]{64}$/
const N_HALF = new BigNumber('7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0', 16)

const pubHex = (k: string | PublicKey): string => {
  const hex = typeof k === 'string' ? k.toLowerCase() : k.toString()
  if (!IDENTITY_RE.test(hex)) throw new Error(`not a compressed public key: ${hex}`)
  return hex
}

// ── locking script ───────────────────────────────────────────────────────────

export function vaultLockingScript (ownerPub: string | PublicKey, agentPub: string | PublicKey, guardPub: string | PublicKey): LockingScript {
  const s = new Script()
    .writeOpCode(OP.OP_IF)
    .writeBin(Utils.toArray(pubHex(ownerPub), 'hex'))
    .writeOpCode(OP.OP_CHECKSIG)
    .writeOpCode(OP.OP_ELSE)
    .writeOpCode(OP.OP_2)
    .writeBin(Utils.toArray(pubHex(agentPub), 'hex'))
    .writeBin(Utils.toArray(pubHex(guardPub), 'hex'))
    .writeOpCode(OP.OP_2)
    .writeOpCode(OP.OP_CHECKMULTISIG)
    .writeOpCode(OP.OP_ENDIF)
  return LockingScript.fromHex(s.toHex())
}

/** The three keys of a vault script, or null if the script is anything else. */
export function parseVaultLockingScript (script: LockingScript | Script | string): VaultKeys | null {
  const hex = (typeof script === 'string' ? script : script.toHex()).toLowerCase()
  const m = VAULT_SCRIPT_RE.exec(hex)
  return m === null ? null : { ownerPub: m[1], agentPub: m[2], guardPub: m[3] }
}

export const isVaultLockingScriptHex = (hex: string): boolean => VAULT_SCRIPT_RE.test(hex.toLowerCase())

// ── keys and records ─────────────────────────────────────────────────────────

/** A party's vault key, computable by anyone: equals the party's getPublicKey({ …, counterparty:'anyone', forSelf:true }). */
export const deriveVaultPub = (identityKey: string, vaultId: string): string =>
  new KeyDeriver('anyone').derivePublicKey(VAULT_PROTOCOL, vaultId, pubHex(identityKey)).toString()

export const vaultKeysForRecord = (r: VaultRecord): VaultKeys => ({
  ownerPub: deriveVaultPub(r.owner, r.vaultId),
  agentPub: deriveVaultPub(r.agent, r.vaultId),
  guardPub: deriveVaultPub(r.guard, r.vaultId)
})

export function vaultScriptForRecord (r: VaultRecord): LockingScript {
  const k = vaultKeysForRecord(r)
  return vaultLockingScript(k.ownerPub, k.agentPub, k.guardPub)
}

export const newVaultId = (): string => Utils.toHex(Random(16))

export const isVaultId = (v: unknown): v is string => typeof v === 'string' && VAULT_ID_RE.test(v)

/** A well-formed vault record (all values strings, three distinct identity keys), else null. */
export function validateVaultRecord (json: unknown): VaultRecord | null {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return null
  const j = json as Record<string, unknown>
  if (j.v !== '1' || !isVaultId(j.vaultId)) return null
  const keys = [j.owner, j.agent, j.guard]
  if (!keys.every(k => typeof k === 'string' && IDENTITY_RE.test(k))) return null
  if (new Set(keys).size !== 3) return null // agent == guard would make the 2-of-2 a single signature
  return { v: '1', vaultId: j.vaultId, owner: j.owner as string, agent: j.agent as string, guard: j.guard as string }
}

/** `OP_FALSE OP_RETURN "agentcoop" "vault" <json>` (MASTER §3.2 envelope). */
export function vaultRecordScript (r: VaultRecord): LockingScript {
  const record: VaultRecord = { v: '1', vaultId: r.vaultId, owner: r.owner, agent: r.agent, guard: r.guard }
  if (validateVaultRecord(record) === null) throw new Error('invalid vault record')
  return buildOpReturn('vault', record)
}

// ── signing ──────────────────────────────────────────────────────────────────

/** BIP-143 sighash (ALL|FORKID) of a vault input; the subscript is the whole vault script. Needs the input's source transaction. */
export function vaultSighash (tx: Transaction, inputIndex: number): number[] {
  const input = tx.inputs[inputIndex]
  if (input === undefined) throw new Error(`no input ${inputIndex}`)
  const sourceTx = input.sourceTransaction
  if (sourceTx === undefined) throw new Error(`input ${inputIndex} has no source transaction`)
  const source = sourceTx.outputs[input.sourceOutputIndex]
  if (source === undefined || source.satoshis === undefined) throw new Error(`input ${inputIndex}: source output missing`)
  const preimage = TransactionSignature.format({
    sourceTXID: input.sourceTXID ?? sourceTx.id('hex'),
    sourceOutputIndex: input.sourceOutputIndex,
    sourceSatoshis: source.satoshis,
    transactionVersion: tx.version,
    otherInputs: tx.inputs.filter((_, i) => i !== inputIndex),
    inputIndex,
    outputs: tx.outputs,
    inputSequence: input.sequence ?? 0xffffffff,
    subscript: source.lockingScript,
    lockTime: tx.lockTime,
    scope: VAULT_SIGHASH
  })
  return Hash.hash256(preimage)
}

/** A wallet's DER signature → checksig format (DER ‖ 0x41). */
export function toChecksigSignature (der: number[]): number[] {
  const sig = Signature.fromDER([...der])
  return new TransactionSignature(sig.r, sig.s, VAULT_SIGHASH).toChecksigFormat()
}

/** True if `checksig` (DER ‖ 0x41, low-S) signs `sighash` with `pub`. */
export function verifyVaultSignature (pub: string, sighash: number[], checksig: number[]): boolean {
  try {
    if (checksig.length < 9 || checksig[checksig.length - 1] !== VAULT_SIGHASH) return false
    const sig = Signature.fromDER(checksig.slice(0, -1))
    if (sig.s.cmp(N_HALF) > 0) return false
    return ECDSA.verify(new BigNumber(sighash), sig, PublicKey.fromString(pub))
  } catch {
    return false
  }
}

const push = (data: number[]): { op: number, data: number[] } => ({ op: data.length, data })

export const vaultOwnerUnlock = (sigOwner: number[]): UnlockingScript =>
  new UnlockingScript([push(sigOwner), { op: OP.OP_1 }])

export const vaultCosignUnlock = (sigAgent: number[], sigGuard: number[]): UnlockingScript =>
  new UnlockingScript([{ op: OP.OP_0 }, push(sigAgent), push(sigGuard), { op: OP.OP_0 }])

// ── payees ───────────────────────────────────────────────────────────────────

/**
 * P2PKH to a provider's revenue key (MASTER §3.2: [1,'agentcoop provider'], keyID = the pool
 * nonce, 'anyone'): anyone can recompute it from the provider's identity key and the keyID.
 */
export const providerPayScript = (provider: string, keyID: string): LockingScript =>
  new P2PKH().lock(new KeyDeriver('anyone').derivePublicKey(PROVIDER_PROTOCOL, keyID, pubHex(provider)).toAddress())

/** The 'anyone' identity (public key 1·G): sender of the guard-approved hot-wallet payments (D-P2 §4.10). */
export const ANYONE_IDENTITY_KEY = new PrivateKey(1).toPublicKey().toString()

/**
 * P2PKH of the agent's BRC-29 key for a payment from 'anyone' (keyID `<prefix> <suffix>`):
 * anyone can recompute it from the agent's identity key, only the agent can spend it.
 * The agent takes it in with internalizeAction (wallet payment, senderIdentityKey = ANYONE_IDENTITY_KEY).
 */
export const hotWalletScript = (agent: string, derivationPrefix: string, derivationSuffix: string): LockingScript =>
  new P2PKH().lock(new KeyDeriver('anyone').derivePublicKey(BRC29_PROTOCOL, `${derivationPrefix} ${derivationSuffix}`, pubHex(agent)).toAddress())
