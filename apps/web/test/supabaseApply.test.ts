import { describe, expect, it } from 'vitest'
import type { LiveTick } from '@agentcoop/relay/contract'
import { createBus } from '../src/events/bus'
import { applyTick, hydrateHistory } from '../src/events/adapters/supabaseApply'
import { makeEvent } from '../src/events/types'
import { makeMockPledge, makeMockPool, MOCK_IDS } from '../src/mock/data'
import { createAppStore } from '../src/store'
import { DEFAULT_SETTINGS } from '../src/store/types'
import type { Listing } from '../src/api/types'

const T = '2026-10-31T12:00:00.000Z'
const L = (outpoint: string): Listing => ({ outpoint, tokenId: 't_0', credits: '10', askSats: '300', seller: '02aa', unlockingScriptHex: '', lockingScriptHex: '', payScriptHex: '' })

function setup () {
  const store = createAppStore('live', undefined, { ...DEFAULT_SETTINGS })
  const bus = createBus(store)
  const seen: string[] = []
  bus.subscribe(e => seen.push(e.type))
  return { store, bus, seen }
}

const poolTick = () => {
  const pool = makeMockPool(1, 10)
  const pledge = makeMockPledge(pool, MOCK_IDS.agents.eval, '100', 10)
  const tick = { v: 1, ts: T, pools: [pool], pledges: { [pool.poolId]: [pledge] } } as unknown as LiveTick
  return { pool, pledge, tick }
}

describe('applyTick', () => {
  it('a tick with a new pool publishes pool_opened and pledge_added, then hydrates the store', () => {
    const { store, bus, seen } = setup()
    const { pool, tick } = poolTick()
    applyTick(bus, store, tick)
    expect(seen).toEqual(['pool_opened', 'pledge_added'])
    expect(store.getState().pools.byId[pool.poolId]?.pledges).toHaveLength(1)
  })

  it('an identical tick publishes nothing', () => {
    const { store, bus, seen } = setup()
    const { tick } = poolTick()
    applyTick(bus, store, tick)
    seen.length = 0
    applyTick(bus, store, tick)
    expect(seen).toEqual([])
  })

  it('listings in a tick replace the book and publish listing_added / listing_filled', () => {
    const { store, bus, seen } = setup()
    applyTick(bus, store, { v: 1, ts: T, listings: [L('a_0'), L('b_0')] } as unknown as LiveTick)
    applyTick(bus, store, { v: 1, ts: T, listings: [L('b_0')] } as unknown as LiveTick)
    expect(seen).toEqual(['listing_added', 'listing_added', 'listing_filled'])
    expect(Object.keys(store.getState().listings.byOutpoint)).toEqual(['b_0'])
  })

  it('vaultCredits publish vault_credits only when the summary changed', () => {
    const { store, bus, seen } = setup()
    const vault = { vaultId: 'v1', owner: '02o', agent: '02a', guard: '02g', scriptHex: '63ab', verified: true, balanceSats: 1000, utxos: [] }
    const credits = { v1: [{ tokenId: 't_0', amt: '3', spent: false }, { tokenId: 't_0', amt: '2', spent: false }] }
    applyTick(bus, store, { v: 1, ts: T, vaults: [vault], vaultCredits: credits } as unknown as LiveTick)
    applyTick(bus, store, { v: 1, ts: T, vaultCredits: credits } as unknown as LiveTick)
    expect(seen.filter(t => t === 'vault_credits')).toHaveLength(1)
    expect(store.getState().vaults.byId.v1?.credits).toEqual([{ tokenId: 't_0', amt: '5', utxos: 2 }])
  })

  it('events in a tick go through the bus once (deduped by src|id)', () => {
    const { store, bus, seen } = setup()
    const e = { id: 'agents:3', ts: T, src: 'agents', type: 'agent_thought', data: { text: 'hi' } }
    applyTick(bus, store, { v: 1, ts: T, events: [e] } as unknown as LiveTick)
    applyTick(bus, store, { v: 1, ts: T, events: [e] } as unknown as LiveTick)
    expect(seen).toEqual(['agent_thought'])
  })

  it('health rows become service_health events only on change', () => {
    const { store, bus, seen } = setup()
    const tick = { v: 1, ts: T, health: [{ service: 'coop', ok: true }, { service: 'relay', ok: true }] } as unknown as LiveTick
    applyTick(bus, store, tick)
    applyTick(bus, store, tick)
    expect(seen).toEqual(['service_health'])
    expect(store.getState().health.coop.ok).toBe(true)
  })
})

describe('hydrateHistory', () => {
  it('fills the feed without calling bus listeners', () => {
    const { store, seen } = setup()
    hydrateHistory(store, [makeEvent('agents', 'agent_thought', { text: 'earlier' }, { id: 'agents:1', ts: T })])
    expect(seen).toEqual([])
    expect(store.getState().feed.map(e => e.type)).toEqual(['agent_thought'])
  })
})
