import { describe, expect, it } from 'vitest'
import { activePledge, mine } from '../src/wallet/mine'
import type { MyPledge } from '../src/wallet/flows/types'

const pledge = (outpoint: string, status: MyPledge['status']): MyPledge => ({ poolId: 'p', label: 'l', txid: 't', outpoint, credits: '10', coinSats: 100, tokenIndex: 0, instructions: { protocolID: [1, 'agentcoop pledge'], keyID: 'k', counterparty: 'anyone', poolId: 'p' }, status, createdAt: '2026-10-30T18:00:00Z' })

describe('mine (my pledges, per identity, persisted)', () => {
  it('keeps pledges per identity and finds the active one', () => {
    mine.getState().load('02aa')
    mine.getState().upsertPledge(pledge('a_0', 'pending'))
    mine.getState().upsertPledge(pledge('b_0', 'settled'))
    expect(activePledge(mine.getState())?.outpoint).toBe('a_0')
    mine.getState().patchPledge('a_0', { status: 'withdrawn' })
    expect(activePledge(mine.getState())).toBeUndefined()
    mine.getState().load('02bb')
    expect(mine.getState().pledges).toHaveLength(0)
    mine.getState().load('02aa')
    expect(mine.getState().pledges).toHaveLength(2)
    mine.getState().load(undefined)
    expect(mine.getState().pledges).toHaveLength(0)
  })
})
