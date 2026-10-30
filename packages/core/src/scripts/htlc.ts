/**
 * Coop Rail BSV-side HTLC locking script (FINAL-IDEA §4.10). Skeleton by
 * Track A; Track D owns it (verification tests 4 and 6) and may change the
 * body (not the signature, MASTER-PLAN §3.4).
 *
 *   OP_IF    OP_SHA256 <hash> OP_EQUALVERIFY
 *            OP_2 <agentPub> <guardPub> OP_2 OP_CHECKMULTISIG   claim: agent + guard with preimage
 *   OP_ELSE  OP_2 <makerPub> <agentPub> OP_2 OP_CHECKMULTISIG   refund: pre-signed, nLockTime = height + k
 *   OP_ENDIF
 */
import { LockingScript, OP, Script, Utils } from '../sdk'

const bytes = (hex: string, len: number, what: string): number[] => {
  const b = Utils.toArray(hex, 'hex')
  if (b.length !== len) throw new Error(`expected a ${len}-byte ${what}`)
  return b
}

export function htlcLockingScript (hash: string, agentPub: string, guardPub: string, makerPub: string): LockingScript {
  const s = new Script()
    .writeOpCode(OP.OP_IF)
    .writeOpCode(OP.OP_SHA256).writeBin(bytes(hash, 32, 'sha256 hash')).writeOpCode(OP.OP_EQUALVERIFY)
    .writeOpCode(OP.OP_2).writeBin(bytes(agentPub, 33, 'public key')).writeBin(bytes(guardPub, 33, 'public key')).writeOpCode(OP.OP_2).writeOpCode(OP.OP_CHECKMULTISIG)
    .writeOpCode(OP.OP_ELSE)
    .writeOpCode(OP.OP_2).writeBin(bytes(makerPub, 33, 'public key')).writeBin(bytes(agentPub, 33, 'public key')).writeOpCode(OP.OP_2).writeOpCode(OP.OP_CHECKMULTISIG)
    .writeOpCode(OP.OP_ENDIF)
  return LockingScript.fromHex(s.toHex())
}
