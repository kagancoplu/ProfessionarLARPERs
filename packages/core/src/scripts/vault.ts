/**
 * Mandate Vault locking script (FINAL-IDEA §4.9). Skeleton by Track A; Track D
 * owns its validation on mainnet (verification test 5) and may change the body
 * (not the signature, MASTER-PLAN §3.4).
 *
 *   OP_IF    <ownerPub> OP_CHECKSIG                          owner alone, any time
 *   OP_ELSE  OP_2 <agentPub> <guardPub> OP_2 OP_CHECKMULTISIG agent + guard
 *   OP_ENDIF
 */
import { LockingScript, OP, Script, Utils } from '../sdk'

const pub = (hex: string): number[] => {
  const bytes = Utils.toArray(hex, 'hex')
  if (bytes.length !== 33) throw new Error('expected a 33-byte compressed public key')
  return bytes
}

export function vaultLockingScript (ownerPub: string, agentPub: string, guardPub: string): LockingScript {
  const s = new Script()
    .writeOpCode(OP.OP_IF)
    .writeBin(pub(ownerPub)).writeOpCode(OP.OP_CHECKSIG)
    .writeOpCode(OP.OP_ELSE)
    .writeOpCode(OP.OP_2).writeBin(pub(agentPub)).writeBin(pub(guardPub)).writeOpCode(OP.OP_2).writeOpCode(OP.OP_CHECKMULTISIG)
    .writeOpCode(OP.OP_ENDIF)
  return LockingScript.fromHex(s.toHex())
}
