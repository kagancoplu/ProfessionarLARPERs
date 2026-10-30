/**
 * GEÇİCİ (Track B, Faz 3): Track D 1.1'deki Mandate Vault script'i, D'nin
 * `packages/core/src/scripts/vault.ts`'i gelene kadar.
 *
 *   OP_IF <ownerPub> OP_CHECKSIG OP_ELSE OP_2 <agentPub> <guardPub> OP_2 OP_CHECKMULTISIG OP_ENDIF
 *
 * Keys (D 1.2): protocol [1,'agentcoop vault'], keyID = vaultId, counterparty
 * 'anyone', so anyone can recompute them from the three identity keys.
 */
import { LockingScript, OP, Script, Utils, type WalletProtocol } from '@bsv/sdk'
import { anyonePublicKey } from '../kit/addresses'

export const VAULT_PROTOCOL: WalletProtocol = [1, 'agentcoop vault']

export function vaultLockingScript (ownerPub: string, agentPub: string, guardPub: string): LockingScript {
  const push = (hex: string): { op: number, data: number[] } => ({ op: 33, data: Utils.toArray(hex, 'hex') })
  return LockingScript.fromHex(new Script([
    { op: OP.OP_IF }, push(ownerPub), { op: OP.OP_CHECKSIG },
    { op: OP.OP_ELSE }, { op: OP.OP_2 }, push(agentPub), push(guardPub), { op: OP.OP_2 }, { op: OP.OP_CHECKMULTISIG },
    { op: OP.OP_ENDIF }
  ]).toHex())
}

/** The vault script the three identities must have, for this vaultId. */
export const expectedVaultScript = (owner: string, agent: string, guard: string, vaultId: string): LockingScript =>
  vaultLockingScript(
    anyonePublicKey(owner, vaultId, VAULT_PROTOCOL).toString(),
    anyonePublicKey(agent, vaultId, VAULT_PROTOCOL).toString(),
    anyonePublicKey(guard, vaultId, VAULT_PROTOCOL).toString()
  )

/** Structural match of the vault template (any keys). */
export function isVaultScriptHex (hex: string): boolean {
  // 63 21<33> ac 67 52 21<33> 21<33> 52 ae 68
  return /^6321[0-9a-f]{66}ac675221[0-9a-f]{66}21[0-9a-f]{66}52ae68$/.test(hex)
}
