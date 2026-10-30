import type { ApiPoolStatus } from '../../api/types'
import type { PoolEntry } from '../../store/types'

export type PoolSort = 'deadline' | 'fill' | 'discount' | 'newest'
export type PoolFilter = 'all' | 'open' | 'settled' | 'failed'

export const fillRatio = (p: PoolEntry): number => { const t = Number(p.terms.credits); return t > 0 ? Number(p.pledgedCredits) / t : 0 }
export const satsPerCredit = (p: PoolEntry): number => { const t = Number(p.terms.credits); return t > 0 ? Number(p.terms.priceSats) / t : 0 }
/** 1 − pool price / retail; "demo pricing" */
export const discount = (p: PoolEntry): number => { const r = Number(p.terms.retailSatsPerCredit); return r > 0 ? 1 - satsPerCredit(p) / r : 0 }
export const blocksLeft = (p: PoolEntry, height?: number): number | undefined => { const h = height ?? p.height; return h === undefined ? undefined : Number(p.terms.deadlineHeight) - h }

const FILTERS: Record<PoolFilter, ApiPoolStatus[] | undefined> = { all: undefined, open: ['open', 'locking'], settled: ['settled'], failed: ['failed', 'cancelled'] }

export function filterPools (pools: PoolEntry[], filter: PoolFilter): PoolEntry[] {
  const allowed = FILTERS[filter]
  return allowed === undefined ? pools : pools.filter(p => allowed.includes(p.status))
}

export function sortPools (pools: PoolEntry[], sort: PoolSort, height?: number): PoolEntry[] {
  const list = [...pools]
  switch (sort) {
    case 'deadline': return list.sort((a, b) => (blocksLeft(a, height) ?? Infinity) - (blocksLeft(b, height) ?? Infinity))
    case 'fill': return list.sort((a, b) => fillRatio(b) - fillRatio(a))
    case 'discount': return list.sort((a, b) => discount(b) - discount(a))
    case 'newest': return list.sort((a, b) => (b.createdHeight ?? 0) - (a.createdHeight ?? 0) || b.updatedAt.localeCompare(a.updatedAt))
  }
}
