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
import { Hash, KeyDeriver, LockingScript, OP, Random, Script, UnlockingScript, Utils, type WalletProtocol } from '../sdk'

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

// ── Track D (D-P3): keys, parsing, unlocking scripts ─────────────────────────

/** Rail keys: keyID = swapId, counterparty 'anyone' (like vault keys: anyone rebuilds the script from three identity keys). */
export const RAIL_PROTOCOL: WalletProtocol = [1, 'agentcoop rail']
/** OP_0 + 2 × <sig ≤73> push + <secret 32> push + OP_1. */
export const HTLC_CLAIM_UNLOCK_LENGTH = 1 + 74 + 74 + 33 + 1
/** OP_0 + <sigMaker> + <sigAgent> + OP_0 (ELSE branch). */
export const HTLC_REFUND_UNLOCK_LENGTH = 1 + 74 + 74 + 1
/** The pre-signed refund's input sequence: below 0xffffffff, so its nLockTime is enforced. */
export const RAIL_REFUND_SEQUENCE = 0xfffffffe

export interface HtlcKeys { hash: string, agentPub: string, guardPub: string, makerPub: string }


/** The HTLC's parts, or null if `script` is anything else (the agent key must be the same in both branches). */
export function parseHtlcLockingScript (script: LockingScript | Script | string): HtlcKeys | null {
  const hex = (typeof script === 'string' ? script : script.toHex()).toLowerCase()
  const m = /^63a820([0-9a-f]{64})88(52)21(0[23][0-9a-f]{64})21(0[23][0-9a-f]{64})52ae675221(0[23][0-9a-f]{64})21(0[23][0-9a-f]{64})52ae68$/.exec(hex)
  if (m === null || m[6] !== m[3]) return null
  return { hash: m[1], agentPub: m[3], guardPub: m[4], makerPub: m[5] }
}

export const newSwapId = (): string => Utils.toHex(Random(16))
export const sha256Hex = (bytes: number[]): string => Utils.toHex(Hash.sha256(bytes))

/** A party's rail key for `swapId`, computable by anyone (= the party's getPublicKey({ RAIL_PROTOCOL, swapId, 'anyone', forSelf })). */
export const deriveRailPub = (identityKey: string, swapId: string): string =>
  new KeyDeriver('anyone').derivePublicKey(RAIL_PROTOCOL, swapId, identityKey).toString()

/** The swap's BSV script from the three identity keys. */
export const railScriptFor = (a: { hash: string, agent: string, guard: string, maker: string, swapId: string }): LockingScript =>
  htlcLockingScript(a.hash, deriveRailPub(a.agent, a.swapId), deriveRailPub(a.guard, a.swapId), deriveRailPub(a.maker, a.swapId))

const push = (data: number[]): { op: number, data: number[] } => ({ op: data.length, data })

/** Claim: OP_0 <sigAgent> <sigGuard> <secret> OP_1 (signatures in pubkey order). */
export const htlcClaimUnlock = (sigAgent: number[], sigGuard: number[], secret: number[]): UnlockingScript =>
  new UnlockingScript([{ op: OP.OP_0 }, push(sigAgent), push(sigGuard), push(secret), { op: OP.OP_1 }])

/** Refund: OP_0 <sigMaker> <sigAgent> OP_0. */
export const htlcRefundUnlock = (sigMaker: number[], sigAgent: number[]): UnlockingScript =>
  new UnlockingScript([{ op: OP.OP_0 }, push(sigMaker), push(sigAgent), { op: OP.OP_0 }])

/** The secret a claim reveals (3rd push of the claim unlock), or null. */
export function secretFromClaimUnlock (unlock: UnlockingScript, hash: string): number[] | null {
  const c = unlock.chunks
  if (c.length !== 5 || c[4].op !== OP.OP_1 || c[3].data?.length !== 32) return null
  return sha256Hex(c[3].data) === hash ? c[3].data : null
}
