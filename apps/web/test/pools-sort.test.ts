import { describe, expect, it } from 'vitest'
import { makeMockPool } from '../src/mock/data'
import type { PoolEntry } from '../src/store/types'
import { discount, fillRatio, filterPools, satsPerCredit, sortPools } from '../src/consoles/pools/sort'

const entry = (n: number, patch: Partial<PoolEntry>): PoolEntry => ({ ...makeMockPool(n, 100), updatedAt: '2026-10-30T18:00:00Z', ...patch })

describe('pool sort and filter', () => {
  const a = entry(1, { pledgedCredits: '500', status: 'open', height: 100 })                           // 50 % · deadline +60
  const b = entry(2, { pledgedCredits: '1000', status: 'settled', height: 100 })
  const c = entry(3, { pledgedCredits: '0', status: 'failed', terms: { ...makeMockPool(3, 100).terms, deadlineHeight: '105', priceSats: '40000' }, height: 100 })
  it('derives fill, price and demo discount', () => {
    expect(fillRatio(a)).toBe(0.5)
    expect(satsPerCredit(a)).toBe(25)
    expect(discount(a)).toBe(0.5)
    expect(discount(c)).toBeCloseTo(0.2)
  })
  it('filters by status group', () => {
    expect(filterPools([a, b, c], 'open').map(p => p.poolId)).toEqual([a.poolId])
    expect(filterPools([a, b, c], 'failed').map(p => p.poolId)).toEqual([c.poolId])
    expect(filterPools([a, b, c], 'all')).toHaveLength(3)
  })
  it('sorts by deadline, fill and discount without mutating', () => {
    const list = [a, b, c]
    expect(sortPools(list, 'deadline').map(p => p.poolId)).toEqual([c.poolId, a.poolId, b.poolId])
    expect(sortPools(list, 'fill').map(p => p.poolId)).toEqual([b.poolId, a.poolId, c.poolId])
    expect(sortPools(list, 'discount')[0]?.poolId).toBe(a.poolId)
    expect(list.map(p => p.poolId)).toEqual([a.poolId, b.poolId, c.poolId])
  })
})
