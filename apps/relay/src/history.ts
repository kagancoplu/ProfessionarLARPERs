/**
 * The pool and pledge events the web derives on its own (apps/web/src/events/derive.ts), derived here too so they
 * reach `coop_events` and a reloaded page's feed shows them (BL-33). History only: live browsers derive them from
 * the ticks themselves. Ids are deterministic, so a relay restart that sees everything as new stores nothing twice.
 */
import type { CoopEnvelope, Json } from './contract'

export type PoolSnapshot = Json & { poolId: string, status: string, pledges?: Json[] }
interface PledgeSeen { spent: boolean }

export class PoolHistory {
  private readonly pools = new Map<string, string>()
  private readonly pledges = new Map<string, PledgeSeen>()

  /** The events between what was seen before and `next`; remembers `next`. */
  diff (next: PoolSnapshot[], ts: string): CoopEnvelope[] {
    const out: CoopEnvelope[] = []
    const ev = (type: string, key: string, data: Json, extra: { poolId: string, txid?: string, agent?: string }): void => {
      out.push({ id: `relay:${type}:${key}`, ts, src: 'overlay', type, data, poolId: extra.poolId, ...(extra.txid !== undefined ? { txid: extra.txid } : {}), ...(extra.agent !== undefined ? { agent: extra.agent } : {}) })
    }
    for (const pool of next) {
      const { pledges = [], ...rest } = pool
      const before = this.pools.get(pool.poolId)
      const str = (k: string): string | undefined => typeof rest[k] === 'string' ? rest[k] as string : undefined
      if (before === undefined) ev('pool_opened', pool.poolId, { pool: rest }, { poolId: pool.poolId, txid: str('txid') })
      else if (before !== 'settled' && pool.status === 'settled') ev('pool_settled', pool.poolId, { poolId: pool.poolId, txid: str('settledTxid') ?? '', participants: rest.pledgeCount ?? 0 }, { poolId: pool.poolId, txid: str('settledTxid') })
      else if (before !== 'cancelled' && pool.status === 'cancelled') ev('pool_cancelled', pool.poolId, { poolId: pool.poolId, txid: str('spendingTxid') ?? '' }, { poolId: pool.poolId, txid: str('spendingTxid') })
      this.pools.set(pool.poolId, pool.status)

      for (const pledge of pledges) {
        const outpoint = typeof pledge.outpoint === 'string' ? pledge.outpoint : undefined
        if (outpoint === undefined) continue
        const spent = pledge.spent === true
        const old = this.pledges.get(outpoint)
        const agent = typeof pledge.participant === 'string' ? pledge.participant : undefined
        if (old === undefined) {
          if (!spent) ev('pledge_added', outpoint, { pledge }, { poolId: pool.poolId, txid: typeof pledge.txid === 'string' ? pledge.txid : undefined, agent })
        } else if (!old.spent && spent && typeof pledge.spendingTxid === 'string' && pool.status !== 'settled') {
          // spent into the settlement is the pool_settled above, not a withdrawal
          ev('pledge_cancelled', outpoint, { pledge, txid: pledge.spendingTxid }, { poolId: pool.poolId, txid: pledge.spendingTxid, agent })
        }
        this.pledges.set(outpoint, { spent })
      }
    }
    return out
  }
}
