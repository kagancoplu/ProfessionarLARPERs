/**
 * Overlay-side Mandate Vault helpers. The script itself is Track D's
 * (`vaultLockingScript` in @agentcoop/core, FINAL-IDEA §4.9):
 *
 *   OP_IF <ownerPub> OP_CHECKSIG OP_ELSE OP_2 <agentPub> <guardPub> OP_2 OP_CHECKMULTISIG OP_ENDIF
 *
 * Keys (Track D 1.2): [1,'agentcoop vault'], keyID = vaultId, counterparty
 * 'anyone', so anyone can recompute a vault's script from its three identity keys.
 */
import { anyonePublicKey, VAULT_PROTOCOL, vaultLockingScript } from '@agentcoop/core'
import type { LockingScript } from '@agentcoop/core/sdk'

/** The vault script the three identities must have, for this vaultId. */
export const expectedVaultScript = (owner: string, agent: string, guard: string, vaultId: string): LockingScript =>
  vaultLockingScript(
    anyonePublicKey(owner, vaultId, VAULT_PROTOCOL).toString(),
    anyonePublicKey(agent, vaultId, VAULT_PROTOCOL).toString(),
    anyonePublicKey(guard, vaultId, VAULT_PROTOCOL).toString()
  )

/** Structural match of the vault template (any keys): 63 21<33> ac 67 52 21<33> 21<33> 52 ae 68 */
export const isVaultScriptHex = (hex: string): boolean => /^6321[0-9a-f]{66}ac675221[0-9a-f]{66}21[0-9a-f]{66}52ae68$/.test(hex)
