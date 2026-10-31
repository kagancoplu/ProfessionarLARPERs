import { afterEach, describe, expect, it } from 'vitest'
import type { CoopEnvelope, HealthRow, Json, LiveTick } from '../src/contract'
import type { RelayConfig } from '../src/config'
import { startRelay, type RelayDeps } from '../src/relay'
import type { Sink } from '../src/sink'

const URLS: RelayConfig['urls'] = { coop: 'http://coop', overlay: 'http://overlay', guard: 'http://guard', provider: 'http://provider', agents: 'http://agents', maker: 'http://maker', arcade: 'http://arcade' }

function harness () {
  const ticks: LiveTick[] = []
  const stored: CoopEnvelope[] = []
  const sink: Sink = {
    upsert: async () => {},
    deleteListingsExcept: async () => {},
    insertEvents: async e => { stored.push(...e) },
    publishTick: async t => { ticks.push(t) },
    pruneTicks: async () => {}
  }
  let pools: Array<Json & { poolId: string, status: string, pledges: Json[] }> = []
  const sse = new Map<string, (data: string, id: string) => void>()
  let coordinator: ((msg: Json) => void) | undefined
  const deps: RelayDeps = {
    sink,
    sources: {
      poolsWithPledges: async () => pools,
      listings: async () => [],
      vaults: async () => [],
      vaultCredits: async () => [],
      agents: async () => [{ identity: '02a1', name: 'finetune' }],
      probe: async (service): Promise<HealthRow> => ({ service, ok: true })
    },
    followSse: (url, onEvent) => { sse.set(url, onEvent); return { close () {} } },
    watchCoordinator: (url, onMessage) => { coordinator = onMessage; expect(url).toBe('ws://coop/ws'); return { close () {} } }
  }
  const timings = { debounceMs: 5, reconcileMs: 60_000, agentsMs: 60_000, probeMs: 60_000, flushMs: 10, heartbeatMs: 60_000, pruneMs: 60_000 }
  return { ticks, stored, deps, timings, sse, setPools: (p: typeof pools) => { pools = p }, coordinator: (m: Json) => coordinator?.(m) }
}

const until = async (cond: () => boolean): Promise<void> => {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise(r => setTimeout(r, 5))
}

describe('startRelay', () => {
  let stop: (() => Promise<void>) | undefined
  afterEach(async () => { await stop?.() })

  it('an overlay event refreshes the pools and publishes them with the raw event in a tick', async () => {
    const h = harness()
    stop = startRelay(URLS, h.deps, h.timings).stop
    await until(() => h.ticks.some(t => t.agents !== undefined)) // first round: roster + health, no pools yet
    h.setPools([{ poolId: 'a_0', status: 'open', pledgedCredits: '0', pledges: [] }])
    h.sse.get('http://overlay/agentcoop/events')?.(JSON.stringify({ type: 'admitted', txid: 'aa' }), '')
    await until(() => h.ticks.some(t => t.pools !== undefined))
    const tick = h.ticks.find(t => t.pools !== undefined)
    expect(tick?.pools?.map(p => p.poolId)).toEqual(['a_0'])
    expect(h.ticks.flatMap(t => t.events ?? []).map(e => e.id)).toContain('overlay:admitted:aa')
  })

  it('BL-33: pool_opened and pledge_added are stored for the feed history, not sent live', async () => {
    const h = harness()
    h.setPools([{ poolId: 'a_0', status: 'open', pledgedCredits: '10', txid: 'a', pledges: [{ outpoint: 'bb_0', txid: 'bb', participant: '02b', credits: '10', spent: false }] }])
    stop = startRelay(URLS, h.deps, h.timings).stop
    await until(() => h.stored.some(e => e.type === 'pledge_added'))
    expect(h.stored.filter(e => e.id.startsWith('relay:')).map(e => e.type)).toEqual(['pool_opened', 'pledge_added'])
    expect(h.ticks.flatMap(t => t.events ?? []).some(e => e.id.startsWith('relay:'))).toBe(false)
  })

  it('guard, agents and maker envelopes go into the tick as they are', async () => {
    const h = harness()
    stop = startRelay(URLS, h.deps, h.timings).stop
    const e: CoopEnvelope = { id: 'guard:7', ts: '2026-10-31T12:00:00.000Z', src: 'guard', type: 'cosign_denied', data: { reason: 'cap' } }
    h.sse.get('http://guard/events')?.(JSON.stringify(e), 'guard:7')
    h.sse.get('http://agents/events')?.('not json', '')
    await until(() => h.ticks.some(t => t.events !== undefined))
    expect(h.ticks.flatMap(t => t.events ?? [])).toEqual([e])
    expect([...h.sse.keys()].sort()).toEqual(['http://agents/events', 'http://guard/events', 'http://maker/events', 'http://overlay/agentcoop/events'])
  })

  it('coordinator messages are stored as events but stay out of the tick', async () => {
    const h = harness()
    stop = startRelay(URLS, h.deps, h.timings).stop
    h.coordinator({ type: 'settled', poolId: 'a_0', txid: 'bb' })
    await until(() => h.stored.length > 0)
    expect(h.stored[0]).toMatchObject({ src: 'coordinator', type: 'settled', data: { poolId: 'a_0', txid: 'bb' }, poolId: 'a_0', txid: 'bb' })
    await new Promise(r => setTimeout(r, 30))
    expect(h.ticks.flatMap(t => t.events ?? []).filter(e => e.src === 'coordinator')).toEqual([])
  })

  it('events older than the relay\'s start are stored but not sent live (a service replaying its backlog)', async () => {
    const h = harness()
    stop = startRelay(URLS, h.deps, h.timings).stop
    const old: CoopEnvelope = { id: 'agents:1', ts: '2020-01-01T00:00:00.000Z', src: 'agents', type: 'agent_thought', data: { text: 'old' } }
    const fresh: CoopEnvelope = { id: 'agents:2', ts: new Date(Date.now() + 1000).toISOString(), src: 'agents', type: 'agent_thought', data: { text: 'new' } }
    h.sse.get('http://agents/events')?.(JSON.stringify(old), 'agents:1')
    h.sse.get('http://agents/events')?.(JSON.stringify(fresh), 'agents:2')
    await until(() => h.stored.length === 2 && h.ticks.some(t => t.events !== undefined))
    expect(h.stored.map(e => e.id)).toEqual(['agents:1', 'agents:2'])
    expect(h.ticks.flatMap(t => t.events ?? []).map(e => e.id)).toEqual(['agents:2'])
  })

  it('an event with an unparsable ts is dropped instead of blocking every later write', async () => {
    const h = harness()
    stop = startRelay(URLS, h.deps, h.timings).stop
    h.sse.get('http://guard/events')?.(JSON.stringify({ id: 'guard:9', ts: 'yesterday', src: 'guard', type: 'cosign_denied', data: {} }), 'guard:9')
    await new Promise(r => setTimeout(r, 40))
    expect(h.stored).toEqual([])
  })

  it('health probes and the agents roster reach the first tick', async () => {
    const h = harness()
    stop = startRelay(URLS, h.deps, h.timings).stop
    await until(() => h.ticks.some(t => t.health !== undefined))
    const health = h.ticks.flatMap(t => t.health ?? []).map(r => r.service).sort()
    expect(health).toEqual(['agents', 'arcade', 'coop', 'guard', 'maker', 'overlay', 'provider'])
    expect(h.ticks.flatMap(t => t.agents ?? [])).toEqual([{ identity: '02a1', name: 'finetune' }])
  })
})
