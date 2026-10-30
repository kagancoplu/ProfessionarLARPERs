/**
 * Settlement size model (validation test 8). Builds a settlement with the
 * real FINAL-IDEA §4.4 layout and real script shapes, using maximum-length
 * signatures, and measures the serialized size. No byte counts are assumed.
 */
import { OP, P2PKH, Script, Transaction, UnlockingScript, Utils, type LockingScript } from '@agentcoop/core/sdk'
import { buildBsv21Script } from '@agentcoop/core'

/** `OP_FALSE OP_RETURN "agentcoop" <op> <json>` (MASTER §3.2). Local stand-in for A's buildOpReturn. */
export const agentcoopOpReturn = (op: string, json: Record<string, string>): LockingScript =>
  new Script()
    .writeOpCode(OP.OP_FALSE)
    .writeOpCode(OP.OP_RETURN)
    .writeBin(Utils.toArray('agentcoop', 'utf8'))
    .writeBin(Utils.toArray(op, 'utf8'))
    .writeBin(Utils.toArray(JSON.stringify(json), 'utf8')) as LockingScript

const HEX64 = 'ab'.repeat(32)
const PKH = 'cd'.repeat(20)
const PKH_BYTES = Utils.toArray(PKH, 'hex')
const push = (n: number): { op: number, data: number[] } => ({ op: n, data: new Array(n).fill(0x30) })
/** <sig 72 DER + 1 sighash> <33-byte pubkey> = 108 bytes, the kit's P2PKH_UNLOCK_LENGTH. */
const p2pkhUnlock = (): UnlockingScript => new UnlockingScript([push(73), push(33)])
/** Vault multisig branch (FINAL-IDEA §4.9): OP_0 <sig> <sig> OP_FALSE (selects OP_ELSE). D to confirm. */
const vaultUnlock = (): UnlockingScript => new UnlockingScript([{ op: OP.OP_0 }, push(73), push(73), { op: OP.OP_FALSE }])

export function buildModelSettlement (opts: { p2pkh: number, vault?: number, amtDigits?: number }): Transaction {
  const n = opts.p2pkh + (opts.vault ?? 0)
  const amt = '9'.repeat(opts.amtDigits ?? 3)
  const tx = new Transaction()
  tx.addInput({ sourceTXID: HEX64, sourceOutputIndex: 0, unlockingScript: p2pkhUnlock(), sequence: 0xffffffff })
  tx.addOutput({ lockingScript: new P2PKH().lock(PKH_BYTES), satoshis: 4_500 })
  for (let i = 0; i < n; i++) {
    tx.addInput({ sourceTXID: HEX64, sourceOutputIndex: i + 1, unlockingScript: i < opts.p2pkh ? p2pkhUnlock() : vaultUnlock(), sequence: 0xffffffff })
  }
  for (let i = 0; i < n; i++) tx.addOutput({ lockingScript: buildBsv21Script({ op: 'transfer', id: `${HEX64}_0`, amt }, PKH), satoshis: 1 })
  // Change returns to the pledge coin's own script: P2PKH, or the vault script (~ OP_IF <33> CHECKSIG OP_ELSE 2 <33> <33> 2 CHECKMULTISIG OP_ENDIF).
  for (let i = 0; i < n; i++) {
    const vault = new Script([{ op: OP.OP_IF }, push(33), { op: OP.OP_CHECKSIG }, { op: OP.OP_ELSE }, { op: OP.OP_2 }, push(33), push(33), { op: OP.OP_2 }, { op: OP.OP_CHECKMULTISIG }, { op: OP.OP_ENDIF }]) as LockingScript
    tx.addOutput({ lockingScript: i < opts.p2pkh ? new P2PKH().lock(PKH_BYTES) : vault, satoshis: 1_000 })
  }
  tx.addOutput({ lockingScript: agentcoopOpReturn('settle', { v: '1', poolId: `${HEX64}_0`, pledgeListHash: HEX64 }), satoshis: 0 })
  return tx
}

export const settlementBytes = (opts: { p2pkh: number, vault?: number, amtDigits?: number }): number =>
  buildModelSettlement(opts).toBinary().length

/** Fee at `satsPerKB`, rounded up (Arcade policy: miningFee { satoshis, bytes: 1000 }). */
export const feeSats = (bytes: number, satsPerKB: number): number => Math.ceil(bytes * satsPerKB / 1000)
