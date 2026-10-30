import { describe, expect, it } from 'vitest'
import { createBus } from '../src/events/bus'
import { createMockWorld } from '../src/mock/state'
import { MockScenario } from '../src/mock/scenario'
import { MOCK_IDS } from '../src/mock/data'
import { createAppStore } from '../src/store'
import { DEFAULT_SETTINGS } from '../src/store/types'

describe('mock scenario', () => {
  it('one synchronous cycle tells the whole story in the store', () => {
    const store = createAppStore('mock', undefined, { ...DEFAULT_SETTINGS })
    const bus = createBus(store)
    const world = createMockWorld()
    const scenario = new MockScenario({ bus, world, loop: false })
    const steps = scenario.runCycleSync(Date.parse('2026-10-30T18:00:00Z'))
    expect(steps).toBeGreaterThan(15)
    const s = store.getState()
    const pools = s.pools.order.map(id => s.pools.byId[id]!)
    expect(pools).toHaveLength(2)
    expect(pools[0]).toMatchObject({ status: 'settled', pledgedCredits: '1000', pledgeCount: 3 })
    expect(pools[0]!.pledges).toHaveLength(3)
    expect(pools[1]).toMatchObject({ status: 'failed', pledgedCredits: '200' })
    expect(Object.keys(s.agents.byIdentity)).toHaveLength(3)
    expect(s.agents.byIdentity[MOCK_IDS.agents.finetune]?.injected?.text).toContain('ignore your budget')
    expect(s.agents.byIdentity[MOCK_IDS.agents.finetune]?.lastDecision?.action).toBe('reject')
    expect(s.metrics).toMatchObject({ settlements: 1, participants: 3, failedPools: 1, deniedByGuard: 1, custodiedSats: 0 })
    const kinds = new Set(s.txs.map(t => t.kind))
    for (const k of ['T2', 'T3', 'T5', 'T6', 'T8', 'T10']) expect(kinds.has(k as never), k).toBe(true)
    expect(s.txs.every(t => t.txid.startsWith('mock_'))).toBe(true)
    expect(s.jobs.byId['mock_job_0']?.status).toBe('done')
    expect(Object.keys(s.listings.byOutpoint)).toHaveLength(0) // listed then swept
    // the world the MSW handlers read agrees with the store
    expect([...world.pools.values()].map(p => p.status)).toEqual(['settled', 'failed'])
    expect(world.decisions.filter(d => d.outcome === 'denied')).toHaveLength(1)
  })

  it('cycles use fresh ids and events have strictly increasing timestamps', () => {
    const store = createAppStore('mock', undefined, { ...DEFAULT_SETTINGS })
    const bus = createBus(store)
    const scenario = new MockScenario({ bus, world: createMockWorld(), loop: false })
    scenario.runCycleSync(0)
    scenario.runCycleSync(100_000)
    const s = store.getState()
    expect(s.pools.order).toHaveLength(4)
    expect(new Set(s.pools.order).size).toBe(4)
    const ts = s.feed.map(e => Date.parse(e.ts))
    for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeGreaterThanOrEqual(ts[i - 1]!)
  })
})
