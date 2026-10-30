/**
 * Structural validation of AgentCoop OP_RETURN records (MASTER §3.2/§3.3).
 * Shared by the topic manager (what to admit) and the lookup service (what to
 * index). Like BSV-21, every json value must be a string.
 *
 * Semantic checks that need other records (does this pledge match its pool's
 * terms?) happen at query time in the lookup service, so the order in which
 * transactions reach the overlay does not matter.
 */
import { isTokenId } from '@agentcoop/core'
import type { PledgeRecord, PoolTerms } from '@agentcoop/core'

/** OP_RETURN op=settle (FINAL-IDEA §4.4; MASTER §3.2 `settle.pledgeListHash`). */
export interface SettleRecord { v: '1', poolId: string, pledgeListHash: string }

export interface VaultRecord { v: '1', vaultId: string, owner: string, agent: string, guard: string }

const UINT_RE = /^(0|[1-9]\d*)$/
const isUint = (v: unknown): v is string => typeof v === 'string' && UINT_RE.test(v) && v.length <= 20
const isHex = (v: unknown, len?: number): v is string =>
  typeof v === 'string' && v.length % 2 === 0 && /^[0-9a-f]*$/.test(v) && (len === undefined ? v.length > 0 : v.length === len)
const isIdentityKey = (v: unknown): v is string => isHex(v, 66) && /^0[23]/.test(v as string)
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max
const allStrings = (json: Record<string, unknown>): boolean => Object.values(json).every(v => typeof v === 'string')

/** Pool terms as written on chain (no poolId: a tx cannot contain its own txid). */
export type PoolRecord = Omit<PoolTerms, 'poolId'>

export function validatePoolRecord (json: Record<string, unknown>): PoolRecord | null {
  if (!allStrings(json) || json.v !== '1') return null
  const ok = isIdentityKey(json.provider) &&
    isText(json.providerApi, 200) &&
    typeof json.tokenId === 'string' && isTokenId(json.tokenId) &&
    isUint(json.credits) && BigInt(json.credits) > 0n &&
    isUint(json.priceSats) && BigInt(json.priceSats) > 0n &&
    isHex(json.payScriptHex) && json.payScriptHex.length <= 2000 &&
    isUint(json.feeSats) &&
    isUint(json.minCredits) &&
    isUint(json.deadlineHeight) &&
    (json.backstopMax === undefined || isUint(json.backstopMax)) &&
    isText(json.label, 120) &&
    isUint(json.retailSatsPerCredit)
  if (!ok) return null
  const { poolId: _ignored, ...rest } = json
  return rest as unknown as PoolRecord
}

export function validatePledgeRecord (json: Record<string, unknown>): PledgeRecord | null {
  if (!allStrings(json) || json.v !== '1') return null
  const ok = typeof json.poolId === 'string' && isTokenId(json.poolId) &&
    isUint(json.credits) && BigInt(json.credits) > 0n &&
    isIdentityKey(json.participant) &&
    isUint(json.tokenIndex) &&
    (json.signer === 'p2pkh' || json.signer === 'vault')
  return ok ? json as unknown as PledgeRecord : null
}

export function validateSettleRecord (json: Record<string, unknown>): SettleRecord | null {
  if (!allStrings(json) || json.v !== '1') return null
  const ok = typeof json.poolId === 'string' && isTokenId(json.poolId) && isHex(json.pledgeListHash, 64)
  return ok ? json as unknown as SettleRecord : null
}

/** Track D 1.1: `vault { v, vaultId, owner, agent, guard }` (identity keys; vaultId is the BRC-43 keyID). */
export function validateVaultRecord (json: Record<string, unknown>): VaultRecord | null {
  if (!allStrings(json) || json.v !== '1') return null
  const ok = typeof json.vaultId === 'string' && /^[A-Za-z0-9 _-]{1,64}$/.test(json.vaultId) &&
    isIdentityKey(json.owner) && isIdentityKey(json.agent) && isIdentityKey(json.guard)
  return ok ? json as unknown as VaultRecord : null
}

/** OP_DUP OP_HASH160 <20> OP_EQUALVERIFY OP_CHECKSIG */
export const isP2pkhHex = (hex: string): boolean => /^76a914[0-9a-f]{40}88ac$/.test(hex)

/** Pledge tx layout (MASTER §3.3): out0 = pledge coin, out1 = fee → payScript, record anywhere after. */
export const PLEDGE_COIN_VOUT = 0
export const PLEDGE_FEE_VOUT = 1
/** Pool tx layout (Track A 1.1): out0 = the N-credit UTXO, poolId = `${txid}_0`. */
export const POOL_CREDIT_VOUT = 0
