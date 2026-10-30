import { describe, expect, it } from 'vitest'
import { createBus } from '../src/events/bus'
import { makeEvent } from '../src/events/types'
import { makeMockPool } from '../src/mock/data'
import { parseJsonl, ReplayPlayer } from '../src/replay/player'
import { createAppStore } from '../src/store'
import { DEFAULT_SETTINGS } from '../src/store/types'

describe('replay player', () => {
  it('parses JSONL (skipping comments and junk) and skips to the settlement', () => {
    const pool = makeMockPool(1, 5)
    const events = [
      makeEvent('overlay', 'pool_opened', { pool }, { ts: '2026-10-30T18:00:00Z', poolId: pool.poolId }),
      makeEvent('coordinator', 'settled', { poolId: pool.poolId, txid: 'mock_s' }, { ts: '2026-10-30T18:00:05Z', poolId: pool.poolId, txid: 'mock_s' }),
      makeEvent('coordinator', 'pool_failed', { poolId: pool.poolId }, { ts: '2026-10-30T18:00:09Z', poolId: pool.poolId })
    ]
    const text = ['# replay', ...events.map(e => JSON.stringify(e)), '{"not":"an event"}', ''].join('\n')
    expect(parseJsonl(text)).toHaveLength(3)
    const store = createAppStore('replay', 'x', { ...DEFAULT_SETTINGS })
    const player = new ReplayPlayer({ bus: createBus(store) })
    player.loadEvents(parseJsonl(text))
    player.skipTo('settled')
    expect(player.position).toBe(2)
    expect(store.getState().pools.byId[pool.poolId]?.status).toBe('settled')
    expect(player.status).toBe('paused')
    player.skipTo('pool_failed')
    expect(player.status).toBe('done')
  })
})
