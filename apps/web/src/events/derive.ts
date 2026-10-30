/**
 * Overlay SSE is coarse (`admitted { txid }`, `spent { txid }`). The web turns it into meaning by
 * re-reading the coordinator's pool list and diffing it against what the store already knows
 * (MASTER §3.10 derived types). Pure diff functions here; the adapter wires them.
 */
import type { ApiPool, Listing, PledgeView } from '../api/types'
import type { PoolEntry } from '../store/types'
import { makeEvent, type AnyCoopEvent } from './types'

export function derivePoolDiff (prev: Record<string, PoolEntry>, next: ApiPool[], ts: string): AnyCoopEvent[] {
  const out: AnyCoopEvent[] = []
  for (const pool of next) {
    const before = prev[pool.poolId]
    if (before === undefined) {
      out.push(makeEvent('overlay', 'pool_opened', { pool }, { ts, poolId: pool.poolId, txid: pool.txid }))
      continue
    }
    if (before.status !== 'settled' && pool.status === 'settled') {
      out.push(makeEvent('overlay', 'pool_settled', { poolId: pool.poolId, txid: pool.settledTxid ?? '', participants: pool.pledgeCount }, { ts, poolId: pool.poolId, txid: pool.settledTxid }))
    } else if (before.status !== 'cancelled' && pool.status === 'cancelled') {
      out.push(makeEvent('overlay', 'pool_cancelled', { poolId: pool.poolId, txid: pool.spendingTxid ?? '' }, { ts, poolId: pool.poolId, txid: pool.spendingTxid }))
    } else if (before.pledgedCredits !== pool.pledgedCredits || before.status !== pool.status) {
      out.push(makeEvent('overlay', 'pool_update', { poolId: pool.poolId, pledgedCredits: pool.pledgedCredits, status: pool.status }, { ts, poolId: pool.poolId }))
    }
  }
  return out
}

export function derivePledgeDiff (prev: PledgeView[] | undefined, next: PledgeView[], poolId: string, ts: string): AnyCoopEvent[] {
  const out: AnyCoopEvent[] = []
  const before = new Map((prev ?? []).map(p => [p.outpoint, p]))
  for (const pledge of next) {
    const old = before.get(pledge.outpoint)
    if (old === undefined) {
      if (!pledge.spent) out.push(makeEvent('overlay', 'pledge_added', { pledge }, { ts, poolId, txid: pledge.txid, agent: pledge.participant }))
    } else if (!old.spent && pledge.spent && pledge.spendingTxid !== undefined) {
      out.push(makeEvent('overlay', 'pledge_cancelled', { pledge, txid: pledge.spendingTxid }, { ts, poolId, txid: pledge.spendingTxid, agent: pledge.participant }))
    }
  }
  return out
}

export function deriveListingDiff (prev: Record<string, Listing>, next: Listing[], ts: string): AnyCoopEvent[] {
  const out: AnyCoopEvent[] = []
  const nextByOutpoint = new Map(next.map(l => [l.outpoint, l]))
  for (const listing of next) if (prev[listing.outpoint] === undefined) out.push(makeEvent('overlay', 'listing_added', { listing }, { ts, agent: listing.seller }))
  for (const [outpoint, listing] of Object.entries(prev)) {
    if (!nextByOutpoint.has(outpoint)) out.push(makeEvent('overlay', 'listing_filled', { listing, txid: '' }, { ts, agent: listing.seller }))
  }
  return out
}
