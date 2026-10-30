import { describe, expect, it } from 'vitest'
import { deriveListingDiff, derivePledgeDiff, derivePoolDiff } from '../src/events/derive'
import { makeMockPledge, makeMockPool, MOCK_IDS } from '../src/mock/data'
import type { PoolEntry } from '../src/store/types'

const T = '2026-10-30T18:00:00.000Z'
const entry = (p: ReturnType<typeof makeMockPool>, extra: Partial<PoolEntry> = {}): PoolEntry => ({ ...p, updatedAt: T, ...extra })

describe('derive (overlay SSE → meaning)', () => {
  it('new pool → pool_opened; settled → pool_settled; cancelled → pool_cancelled; progress → pool_update', () => {
    const a = makeMockPool(1, 10)
    const b = makeMockPool(2, 10)
    const c = makeMockPool(3, 10)
    const prev = { [b.poolId]: entry(b), [c.poolId]: entry(c, { pledgedCredits: '100' }) }
    const events = derivePoolDiff(prev, [a, { ...b, status: 'settled', settledTxid: 'mock_s' }, { ...c, pledgedCredits: '400' }], T)
    expect(events.map(e => e.type)).toEqual(['pool_opened', 'pool_settled', 'pool_update'])
    expect(events[1]).toMatchObject({ txid: 'mock_s', poolId: b.poolId })
    expect(derivePoolDiff({ [a.poolId]: entry(a) }, [{ ...a, status: 'cancelled', spendingTxid: 'mock_c' }], T)[0]?.type).toBe('pool_cancelled')
    expect(derivePoolDiff({ [a.poolId]: entry(a) }, [a], T)).toEqual([])
  })

  it('pledges: unseen unspent → pledge_added; spent since → pledge_cancelled', () => {
    const pool = makeMockPool(1, 10)
    const p1 = makeMockPledge(pool, MOCK_IDS.agents.eval, '100', 10)
    const p2 = makeMockPledge(pool, MOCK_IDS.agents.inference, '200', 10)
    const first = derivePledgeDiff(undefined, [p1, p2], pool.poolId, T)
    expect(first.map(e => e.type)).toEqual(['pledge_added', 'pledge_added'])
    expect(first[0]?.agent).toBe(MOCK_IDS.agents.eval)
    const second = derivePledgeDiff([p1, p2], [{ ...p1, spent: true, spendingTxid: 'mock_x' }, p2], pool.poolId, T)
    expect(second).toHaveLength(1)
    expect(second[0]).toMatchObject({ type: 'pledge_cancelled', txid: 'mock_x' })
  })

  it('listings: added and gone', () => {
    const l = { outpoint: 'mock_l_0', tokenId: 't', credits: '10', askSats: '300', seller: MOCK_IDS.agents.eval, unlockingScriptHex: '', lockingScriptHex: '', payScriptHex: '' }
    expect(deriveListingDiff({}, [l], T)[0]?.type).toBe('listing_added')
    expect(deriveListingDiff({ [l.outpoint]: l }, [], T)[0]?.type).toBe('listing_filled')
  })
})
