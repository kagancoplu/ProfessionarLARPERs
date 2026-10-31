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
 *
 * Vault-redeemed credits (A-P5, D's 22:45 request): a redeem paid from a
 * Mandate Vault records that vault's script for the identity and token; while
 * any prepaid balance remains, returns go back onto that vault script, never to
 * the agent's own key (which would bypass the guard's per-redeem cap).
 */
import { JsonFile } from './jsonFile'

interface RedeemRecord { identity: string, tokenId: string, minutes: number, at: string }

interface LedgerState {
  /** identity key → token id → prepaid GPU minutes */
  balances: Record<string, Record<string, number>>
  /** "txid.vout" of every redeemed token output */
  redeemed: Record<string, RedeemRecord>
  /** identity key → token id → the vault script prepaid credits came from (returns go back there) */
  vaults?: Record<string, Record<string, string>>
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

  /** The redeem was paid from this vault: returns of `identity`'s `tokenId` balance go back onto it. */
  noteVault (identity: string, tokenId: string, vaultScriptHex: string): void {
    this.state.vaults ??= {}
    this.state.vaults[identity] = { ...this.state.vaults[identity], [tokenId]: vaultScriptHex }
    this.store.write(this.state)
  }

  /** The vault script returns must go to, while a vault-sourced balance remains. */
  vaultOf (identity: string, tokenId: string): string | undefined {
    return this.state.vaults?.[identity]?.[tokenId]
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
    if (mine[tokenId] === 0) {
      delete mine[tokenId]
      if (this.state.vaults?.[identity] !== undefined) delete this.state.vaults[identity][tokenId] // used up: no vault left to return to
    }
    this.state.balances[identity] = mine
    if (Object.keys(mine).length === 0) delete this.state.balances[identity]
    this.store.write(this.state)
  }
}
