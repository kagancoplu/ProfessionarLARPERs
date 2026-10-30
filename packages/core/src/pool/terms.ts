/** Pool terms: validation, canonical hash and per-share cost (MASTER-PLAN §3.3). */
import { Hash, Utils } from '../sdk'
import { AgentCoopError } from '../errors'
import type { PoolTerms } from '../types'

const UINT = /^(0|[1-9]\d*)$/

export function validateTerms (t: PoolTerms): void {
  const bad = (msg: string): never => { throw new AgentCoopError('BAD_TERMS', msg) }
  if (t.v !== '1') bad('v must be "1"')
  for (const k of ['credits', 'priceSats', 'feeSats', 'minCredits', 'deadlineHeight', 'retailSatsPerCredit'] as const) {
    if (typeof t[k] !== 'string' || !UINT.test(t[k])) bad(`${k} must be a non-negative integer string`)
  }
  if (t.backstopMax !== undefined && !UINT.test(t.backstopMax)) bad('backstopMax must be an integer string')
  if (BigInt(t.credits) <= 0n) bad('credits must be > 0')
  if (BigInt(t.priceSats) <= 0n) bad('priceSats must be > 0')
  if (BigInt(t.feeSats) <= 0n) bad('feeSats must be > 0 (pledge layout always has the fee output)')
  if (BigInt(t.minCredits) <= 0n || BigInt(t.minCredits) > BigInt(t.credits)) bad('minCredits must be in 1..credits')
  if (!/^([0-9a-f]{2})+$/.test(t.payScriptHex)) bad('payScriptHex must be hex')
  if (!/^[0-9a-f]{64}_\d+$/.test(t.tokenId)) bad('tokenId must be txid_vout')
  if (!/^0[23][0-9a-f]{64}$/.test(t.provider)) bad('provider must be a compressed identity key')
}

/** sha256 hex of the terms as JSON with sorted keys (undefined fields left out). */
export function termsHash (t: PoolTerms): string {
  const sorted = Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  return Utils.toHex(Hash.sha256(Utils.toArray(JSON.stringify(sorted), 'utf8')))
}

/** What k credits cost: ceil(k · P / N) sats. */
export function creditsCost (t: Pick<PoolTerms, 'credits' | 'priceSats'>, credits: string | bigint): bigint {
  const k = BigInt(credits)
  const n = BigInt(t.credits)
  return (k * BigInt(t.priceSats) + n - 1n) / n
}
