/**
 * Prepaid credit balances (FINAL-IDEA §4.7): credits an agent redeemed (sent
 * to the provider-api token address) and has not used up yet. Off-chain and
 * trusted, so it is capped (≤ 20 credits per redeem and ≤ 20 credits pending
 * per agent), and unused whole credits can be returned as tokens.
 *
 * Balances are kept in GPU minutes: a redeemed credit adds `minutesPerCredit`
 * minutes (gpu-h100: 60), and each job debits its minutes, so a 45-minute job
 * leaves 15 minutes for the next one.
 *
 * Balance changes are synchronous: no other request runs between a check and
 * its debit. A redeem reserves its outpoint and amount before the async
 * internalize, so a parallel redeem of the same outpoint (or one that would
 * pass the cap) is refused.
 */
import { JsonFile } from './jsonFile'

interface RedeemRecord { identity: string, tokenId: string, minutes: number, at: string }

interface LedgerState {
  /** identity key → token id → prepaid GPU minutes */
  balances: Record<string, Record<string, number>>
  /** "txid.vout" of every redeemed token output */
  redeemed: Record<string, RedeemRecord>
}

export type ReserveResult = 'ok' | 'replayed' | 'over-limit'

export class CreditLedger {
  private readonly store: JsonFile<LedgerState>
  private readonly state: LedgerState
  private readonly pending = new Map<string, RedeemRecord>()

  constructor (file?: string) {
    this.store = new JsonFile<LedgerState>(file, () => ({ balances: {}, redeemed: {} }))
    this.state = this.store.read()
  }

  /** Prepaid minutes of `identity` in `tokenId`. */
  balance (identity: string, tokenId: string): number {
    return this.state.balances[identity]?.[tokenId] ?? 0
  }

  /** Debit `minutes` if the balance covers them. */
  tryDebit (identity: string, tokenId: string, minutes: number): boolean {
    if (minutes <= 0 || this.balance(identity, tokenId) < minutes) return false
    this.add(identity, tokenId, -minutes)
    return true
  }

  /** Put back minutes debited for something that then failed. */
  refund (identity: string, tokenId: string, minutes: number): void {
    this.add(identity, tokenId, minutes)
  }

  isRedeemed (outpoint: string): boolean {
    return outpoint in this.state.redeemed || this.pending.has(outpoint)
  }

  /** Step 1 of a redeem: claim the outpoint and room under the cap (`capMinutes` = max pending). */
  reserveRedeem (outpoint: string, identity: string, tokenId: string, minutes: number, capMinutes: number): ReserveResult {
    if (this.isRedeemed(outpoint)) return 'replayed'
    const inFlight = [...this.pending.values()]
      .filter(r => r.identity === identity && r.tokenId === tokenId)
      .reduce((s, r) => s + r.minutes, 0)
    if (this.balance(identity, tokenId) + inFlight + minutes > capMinutes) return 'over-limit'
    this.pending.set(outpoint, { identity, tokenId, minutes, at: new Date().toISOString() })
    return 'ok'
  }

  /** Step 2a: the token output is ours; credit the balance. Returns the new balance in minutes. */
  commitRedeem (outpoint: string): number {
    const r = this.pending.get(outpoint)
    if (r === undefined) throw new Error(`no pending redeem for ${outpoint}`)
    this.pending.delete(outpoint)
    this.state.redeemed[outpoint] = r
    this.add(r.identity, r.tokenId, r.minutes) // saves
    return this.balance(r.identity, r.tokenId)
  }

  /** Step 2b: internalizing failed; forget the reservation. */
  releaseRedeem (outpoint: string): void {
    this.pending.delete(outpoint)
  }

  private add (identity: string, tokenId: string, delta: number): void {
    const mine = this.state.balances[identity] ?? {}
    mine[tokenId] = (mine[tokenId] ?? 0) + delta
    if (mine[tokenId] === 0) delete mine[tokenId]
    this.state.balances[identity] = mine
    if (Object.keys(mine).length === 0) delete this.state.balances[identity]
    this.store.write(this.state)
  }
}
