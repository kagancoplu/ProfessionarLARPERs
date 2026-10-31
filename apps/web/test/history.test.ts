import { describe, expect, it } from 'vitest'
import { createBus } from '../src/events/bus'
import { createMockWorld } from '../src/mock/state'
import { MockScenario } from '../src/mock/scenario'
import { MOCK_IDS } from '../src/mock/data'
import { createAppStore } from '../src/store'
import { DEFAULT_SETTINGS, HISTORY_LIMIT, initialData } from '../src/store/types'
import { applyEventToData } from '../src/store/reducers'
import { makeEvent } from '../src/events/types'
import { leaderboard, priceSeries, refusalSeries, savingsSeries } from '../src/consoles/metrics/series'

function cycles (n: number) {
  const store = createAppStore('mock', undefined, { ...DEFAULT_SETTINGS })
  const scenario = new MockScenario({ bus: createBus(store), world: createMockWorld(), loop: false })
  for (let i = 0; i < n; i++) scenario.runCycleSync(Date.parse('2026-10-30T18:00:00Z') + i * 100_000)
  return store.getState()
}

describe('session history', () => {
  it('a cycle leaves a full pool timeline, a settlement point, a refusal and prices', () => {
    const s = cycles(1)
    const [settledPool, failedPool] = s.pools.order
    const steps = s.history.poolSteps[settledPool!]!.map(x => x.step)
    expect(steps[0]).toBe('opened')
    expect(steps.filter(x => x === 'pledge')).toHaveLength(3)
    expect(steps).toContain('locking')
    expect(steps).toContain('signed')
    expect(steps.indexOf('signed')).toBeGreaterThan(steps.lastIndexOf('pledge'))
    expect(steps.at(-1)).toBe('settled')
    expect(steps.filter(x => x === 'settled')).toHaveLength(1) // overlay and coordinator report the same txid once
    expect(s.history.poolSteps[failedPool!]!.at(-1)?.step).toBe('failed')
    const settled = s.history.points.filter(p => p.k === 'settled')
    expect(settled).toHaveLength(1)
    expect(settled[0]!.k === 'settled' && settled[0]!.savingsSats).toBe(s.metrics.villageSavingsSats)
    expect(s.history.points.filter(p => p.k === 'denied')).toHaveLength(s.metrics.deniedByGuard)
    expect(s.history.points.some(p => p.k === 'price' && p.filled)).toBe(true)
  })

  it('series run totals, and the leaderboard ranks agents by savings', () => {
    const s = cycles(2)
    const sav = savingsSeries(s.history.points)
    expect(sav.points).toHaveLength(2)
    expect(sav.points[1]!.v).toBe(s.metrics.villageSavingsSats)
    expect(refusalSeries(s.history.points, {}).points.at(-1)?.v).toBe(s.metrics.deniedByGuard)
    const prices = priceSeries(s.history.points)
    expect(prices.retail).toBeGreaterThan(0)
    expect(prices.series.every(x => x.points.every(p => p.v > 0))).toBe(true)
    const board = leaderboard(s.agents.byIdentity, s.history.agentStats)
    expect(board).toHaveLength(3)
    expect(board.every(r => r.profile !== 'unknown')).toBe(true)
    for (let i = 1; i < board.length; i++) expect(board[i - 1]!.savingsSats).toBeGreaterThanOrEqual(board[i]!.savingsSats)
    expect(board.find(r => r.identity === MOCK_IDS.agents.inference)?.pools).toBeGreaterThan(0)
    // every agent in the settled pool is credited with its share of the savings
    expect(board.every(r => r.savingsSats > 0 && r.creditsBought > 0)).toBe(true)
  })

  it('keeps at most HISTORY_LIMIT points', () => {
    let d = initialData('mock')
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) d = applyEventToData(d, makeEvent('guard', 'cosign_denied', { agent: 'a', kind: 'pledge', reason: `r${i}` }, { ts: new Date(i * 1000).toISOString() }))
    expect(d.history.points).toHaveLength(HISTORY_LIMIT)
    expect(d.history.points.at(-1)).toMatchObject({ reason: `r${HISTORY_LIMIT + 19}` })
  })
})
