import { describe, expect, it } from 'vitest'
import { PoolHistory, type PoolSnapshot } from '../src/history'

const T = '2026-10-31T10:00:00.000Z'
const pledge = (outpoint: string, extra: Record<string, unknown> = {}) => ({ outpoint, txid: outpoint.slice(0, 2), participant: `02${outpoint}`, credits: '10', spent: false, ...extra })
const pool = (status: string, pledges: Array<ReturnType<typeof pledge>>, extra: Record<string, unknown> = {}): PoolSnapshot => ({ poolId: 'p_0', status, txid: 'p', pledgeCount: pledges.length, pledges, ...extra })

describe('PoolHistory (BL-33)', () => {
  it('a new pool and its standing pledges become pool_opened and pledge_added; spent ones it never saw are skipped', () => {
    const h = new PoolHistory()
    const out = h.diff([pool('open', [pledge('aa_1'), pledge('bb_1', { spent: true, spendingTxid: 'cc' })])], T)
    expect(out.map(e => [e.type, e.id])).toEqual([['pool_opened', 'relay:pool_opened:p_0'], ['pledge_added', 'relay:pledge_added:aa_1']])
    expect(out[0]).toMatchObject({ src: 'overlay', poolId: 'p_0', txid: 'p', data: { pool: { poolId: 'p_0', status: 'open' } } })
    expect((out[0].data as { pool: Record<string, unknown> }).pool.pledges).toBeUndefined()
    expect(out[1]).toMatchObject({ agent: '02aa_1', data: { pledge: { outpoint: 'aa_1' } } })
    expect(h.diff([pool('open', [pledge('aa_1'), pledge('bb_1', { spent: true, spendingTxid: 'cc' })])], T)).toEqual([]) // nothing changed
  })

  it('a withdrawal is pledge_cancelled; a settlement is pool_settled, not a cancel per pledge', () => {
    const h = new PoolHistory()
    h.diff([pool('open', [pledge('aa_1'), pledge('bb_1')])], T)
    const cancel = h.diff([pool('open', [pledge('aa_1', { spent: true, spendingTxid: 'dd' }), pledge('bb_1')])], T)
    expect(cancel.map(e => e.type)).toEqual(['pledge_cancelled'])
    expect(cancel[0]).toMatchObject({ id: 'relay:pledge_cancelled:aa_1', txid: 'dd', data: { txid: 'dd' } })
    const settle = h.diff([pool('settled', [pledge('aa_1', { spent: true, spendingTxid: 'dd' }), pledge('bb_1', { spent: true, spendingTxid: 'ee' })], { settledTxid: 'ee' })], T)
    expect(settle.map(e => e.type)).toEqual(['pool_settled'])
    expect(settle[0]).toMatchObject({ txid: 'ee', data: { poolId: 'p_0', txid: 'ee', participants: 2 } })
  })

  it('a restarted relay derives the same ids, so the stored history is not duplicated', () => {
    const snap = [pool('open', [pledge('aa_1')])]
    expect(new PoolHistory().diff(snap, T).map(e => e.id)).toEqual(new PoolHistory().diff(snap, '2026-11-01T00:00:00.000Z').map(e => e.id))
  })
})
