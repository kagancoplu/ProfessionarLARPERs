/**
 * Vault-locked credits (track A 5.1, FINAL-IDEA §8 "the agent sells its credits
 * and bypasses the guard"). The same canonical BSV-21 inscription, but owned by
 * the Mandate Vault script instead of a P2PKH:
 *
 *   OP_FALSE OP_IF "ord" OP_1 "application/bsv-20" OP_0 <json> OP_ENDIF
 *   OP_IF <ownerPub> OP_CHECKSIG OP_ELSE OP_2 <agentPub> <guardPub> OP_2 OP_CHECKMULTISIG OP_ENDIF
 *
 * Script does not enforce BSV-21, but it does enforce ownership: spending the
 * credits needs the owner alone or agent + guard. Token rules (conservation,
 * lineage) are unchanged; only the owner suffix widens. Unlocking scripts are
 * the vault's (the envelope is a no-op), and the sighash subscript is the whole
 * locking script, inscription included.
 */
import { Hash, LockingScript, OP, Script, Utils } from '../sdk'
import { BSV21_CONTENT_TYPE, buildBsv21Script, decodeBsv21, validatePayload, type Bsv21Inscription } from '../kit/inscription'
import { isVaultLockingScriptHex, parseVaultLockingScript, type VaultKeys } from './vault'

export type CreditOwner =
  | { kind: 'p2pkh', pkh: string }
  | { kind: 'vault', vaultScriptHex: string, /** sha256(vault script) hex, for lookup indexes. */ vaultHash: string }

export type OwnerKind = CreditOwner['kind']

export interface DecodedBsv21Owned extends Bsv21Inscription {
  amount: bigint
  owner: CreditOwner
}

export const vaultScriptHash = (vaultScriptHex: string): string =>
  Utils.toHex(Hash.sha256(Utils.toArray(vaultScriptHex, 'hex')))

/** The BSV-21 envelope alone (no owner suffix). */
function envelope (insc: Bsv21Inscription): string {
  // buildBsv21Script validates the payload and writes the canonical envelope; drop its 25-byte P2PKH suffix.
  const hex = buildBsv21Script(insc, new Array(20).fill(0)).toHex()
  return hex.slice(0, hex.length - 50)
}

/** A canonical BSV-21 output owned by a Mandate Vault script (5.1). */
export function buildVaultCreditScript (insc: Bsv21Inscription, vaultScript: LockingScript | string): LockingScript {
  const vault = (typeof vaultScript === 'string' ? vaultScript : vaultScript.toHex()).toLowerCase()
  if (!isVaultLockingScriptHex(vault)) throw new Error('not a Mandate Vault locking script')
  return LockingScript.fromHex(envelope(insc) + vault)
}

/**
 * Decode a canonical BSV-21 output with either owner: P2PKH (exactly the kit's
 * decodeBsv21) or a Mandate Vault script. Null for anything else.
 */
export function decodeBsv21Owned (script: LockingScript | Script | string): DecodedBsv21Owned | null {
  const p2pkh = decodeBsv21(script)
  if (p2pkh !== null) {
    const { ownerPkh, ...rest } = p2pkh
    return { ...rest, owner: { kind: 'p2pkh', pkh: ownerPkh } }
  }
  try {
    const s = typeof script === 'string' ? LockingScript.fromHex(script) : script
    const c = s.chunks
    if (c.length < 9) return null
    if (c[0].op !== OP.OP_FALSE || c[1].op !== OP.OP_IF) return null
    if (c[2].data === undefined || Utils.toUTF8(c[2].data) !== 'ord') return null
    if (c[3].op !== OP.OP_1 || c[3].data !== undefined) return null // canonical tag only
    if (c[4].data === undefined || Utils.toUTF8(c[4].data) !== BSV21_CONTENT_TYPE) return null
    if (c[5].op !== OP.OP_0 || (c[5].data !== undefined && c[5].data.length > 0)) return null
    if (c[7].op !== OP.OP_ENDIF) return null
    const vaultScriptHex = new Script(c.slice(8)).toHex()
    if (!isVaultLockingScriptHex(vaultScriptHex)) return null
    const json = JSON.parse(Utils.toUTF8(c[6].data ?? []))
    if (json === null || typeof json !== 'object' || Array.isArray(json)) return null
    const p = validatePayload(json)
    return { ...p, amount: BigInt(p.amt), owner: { kind: 'vault', vaultScriptHex, vaultHash: vaultScriptHash(vaultScriptHex) } }
  } catch {
    return null
  }
}

/** The vault keys of a plain vault output or of vault-locked credits; null otherwise. */
export function vaultKeysOfScript (script: LockingScript | Script | string): VaultKeys | null {
  const direct = parseVaultLockingScript(script)
  if (direct !== null) return direct
  const d = decodeBsv21Owned(script)
  return d?.owner.kind === 'vault' ? parseVaultLockingScript(d.owner.vaultScriptHex) : null
}
