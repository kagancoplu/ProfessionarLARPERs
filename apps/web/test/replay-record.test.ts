import { describe, expect, it } from 'vitest'
import text from '../public/replays/mock-demo.jsonl?raw'
import { createBus } from '../src/events/bus'
import { parseJsonl, ReplayPlayer } from '../src/replay/player'
import { createAppStore } from '../src/store'
import { DEFAULT_SETTINGS } from '../src/store/types'

describe('public/replays/mock-demo.jsonl', () => {
  const events = parseJsonl(text)
  it('is a recorded mock cycle: starts with the agents, has one settlement and one failed pool, only mock_ txids', () => {
    expect(events.length).toBeGreaterThan(30)
    expect(events[0]?.type).toBe('agent_started')
    expect(events.filter(e => e.type === 'settled')).toHaveLength(1)
    expect(events.filter(e => e.type === 'pool_failed')).toHaveLength(1)
    expect(events.every(e => e.txid === undefined || e.txid.startsWith('mock_'))).toBe(true)
  })
  it('replays into the same end state as the live scenario', () => {
    const store = createAppStore('replay', 'mock-demo', { ...DEFAULT_SETTINGS })
    const player = new ReplayPlayer({ bus: createBus(store) })
    player.loadEvents(events)
    player.skipTo('pool_failed')
    const s = store.getState()
    expect(s.metrics).toMatchObject({ settlements: 1, failedPools: 1, deniedByGuard: 1, custodiedSats: 0 })
    expect(s.pools.order).toHaveLength(2)
  })
})
