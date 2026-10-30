import { describe, expect, it } from 'vitest'
import { createBus } from '../src/events/bus'
import { pollAgents, pollListings, pollVaults, type LivePollSources } from '../src/events/livePoll'
import { createAppStore } from '../src/store'
import { DEFAULT_SETTINGS } from '../src/store/types'
import type { Listing } from '../src/api/types'

const L = (outpoint: string, seller = '02aa'): Listing => ({ outpoint, tokenId: 't_0', credits: '10', askSats: '300', seller, unlockingScriptHex: '', lockingScriptHex: '', payScriptHex: '' })

describe('live polling (listings, agents, vaults)', () => {
  it('turns listing snapshots into listing_added / listing_filled events and hydrates the store', async () => {
    const store = createAppStore('live', undefined, { ...DEFAULT_SETTINGS })
    const bus = createBus(store)
    const seen: string[] = []
    bus.subscribe(e => seen.push(e.type))
    let snapshot = [L('a_0'), L('b_0')]
    const src: LivePollSources = { listings: async () => snapshot, agents: async () => [], vaults: async () => [] }
    await pollListings(bus, store, src)
    expect(Object.keys(store.getState().listings.byOutpoint).sort()).toEqual(['a_0', 'b_0'])
    expect(seen.filter(t => t === 'listing_added')).toHaveLength(2)
    snapshot = [L('b_0')]
    await pollListings(bus, store, src)
    expect(seen.filter(t => t === 'listing_filled')).toHaveLength(1)
    expect(Object.keys(store.getState().listings.byOutpoint)).toEqual(['b_0'])
  })
  it('hydrates the agents roster and vaults without losing what events already added', async () => {
    const store = createAppStore('live', undefined, { ...DEFAULT_SETTINGS })
    const src: LivePollSources = {
      listings: async () => [],
      agents: async () => [{ name: 'finetune', profile: 'finetune', identity: '02a1', mode: 'vault', vaultId: 'v1' }],
      vaults: async () => [{ vaultId: 'v1', owner: '03o', agent: '02a1', guard: '02g', scriptHex: '', verified: true, balanceSats: 5000, utxos: [] }]
    }
    await pollAgents(store, src)
    await pollVaults(store, src)
    expect(store.getState().agents.byIdentity['02a1']?.mode).toBe('vault')
    expect(store.getState().vaults.byId.v1?.balanceSats).toBe(5000)
    expect(store.getState().vaults.byId.v1?.decisions).toEqual([])
  })
})
