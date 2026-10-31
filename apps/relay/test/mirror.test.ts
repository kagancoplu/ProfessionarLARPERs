import { describe, expect, it } from 'vitest'
import type { CoopEnvelope, Json, LiveTick } from '../src/contract'
import { Mirror } from '../src/mirror'
import type { Sink } from '../src/sink'

class FakeSink implements Sink {
  upserts: Array<{ table: string, rows: Json[] }> = []
  kept: string[][] = []
  events: CoopEnvelope[][] = []
  ticks: LiveTick[] = []
  failNextUpsert = false
  async upsert (table: string, rows: Json[]): Promise<void> {
    if (this.failNextUpsert) { this.failNextUpsert = false; throw new Error('supabase down') }
    this.upserts.push({ table, rows })
  }
  async deleteListingsExcept (outpoints: string[]): Promise<void> { this.kept.push(outpoints) }
  async insertEvents (events: CoopEnvelope[]): Promise<void> { this.events.push(events) }
  async publishTick (tick: LiveTick): Promise<void> { this.ticks.push(tick) }
  async pruneTicks (): Promise<void> {}
  rows (table: string): Json[] { return this.upserts.filter(u => u.table === table).flatMap(u => u.rows) }
}

const pl = (outpoint: string): Json => ({ outpoint, poolId: 'a_0', credits: '5', spent: false })
const P = (poolId: string, status: string, pledges: Json[], pledgedCredits = '0') => ({ poolId, status, pledgedCredits, pledges })
const L = (outpoint: string) => ({ outpoint, tokenId: 't_0', credits: '10', askSats: '300' })
const E = (src: string, id: string): CoopEnvelope => ({ id, ts: '2026-10-31T12:00:00.000Z', src, type: 'agent_thought', data: { text: id } })

describe('Mirror', () => {
  it('first setPools emits all pools and their pledges; an identical second snapshot emits nothing', async () => {
    const sink = new FakeSink()
    const m = new Mirror(sink)
    m.setPools([P('a_0', 'open', [pl('x_1')]), P('b_0', 'open', [])])
    const tick = await m.flush()
    expect(tick?.pools?.map(p => p.poolId)).toEqual(['a_0', 'b_0'])
    expect(tick?.pledges?.a_0).toHaveLength(1)
    expect(sink.rows('live_pools')[0]).toEqual({ pool_id: 'a_0', status: 'open', data: { poolId: 'a_0', status: 'open', pledgedCredits: '0' } })
    expect(sink.rows('live_pledges')[0]).toEqual({ outpoint: 'x_1', pool_id: 'a_0', data: pl('x_1') })
    m.setPools([P('a_0', 'open', [pl('x_1')]), P('b_0', 'open', [])])
    expect(await m.flush()).toBeUndefined()
    expect(sink.ticks).toHaveLength(1)
  })

  it('a changed pool emits only that pool and its pledges', async () => {
    const sink = new FakeSink()
    const m = new Mirror(sink)
    m.setPools([P('a_0', 'open', [pl('x_1')]), P('b_0', 'open', [])])
    await m.flush()
    m.setPools([P('a_0', 'open', [pl('x_1')]), P('b_0', 'open', [], '7')])
    const tick = await m.flush()
    expect(tick?.pools?.map(p => p.poolId)).toEqual(['b_0'])
    expect(Object.keys(tick?.pledges ?? {})).toEqual(['b_0'])
  })

  it('listings: a missing listing is deleted from the table and the full list goes in the tick', async () => {
    const sink = new FakeSink()
    const m = new Mirror(sink)
    m.setListings([L('l1_0'), L('l2_0')])
    await m.flush()
    m.setListings([L('l2_0')])
    const tick = await m.flush()
    expect(sink.kept.at(-1)).toEqual(['l2_0'])
    expect(tick?.listings).toEqual([L('l2_0')])
  })

  it('events: live events go to the tick and the table; coordinator events only to the table', async () => {
    const sink = new FakeSink()
    const m = new Mirror(sink)
    const g = E('guard', 'guard:1')
    const c = E('coordinator', 'coordinator:settled:a_0')
    m.pushEvent(g)
    m.pushEvent(c, { live: false })
    const tick = await m.flush()
    expect(sink.events.flat()).toEqual([g, c])
    expect(tick?.events).toEqual([g])
  })

  it('flush with nothing changed publishes no tick; heartbeat publishes { heartbeat: true }', async () => {
    const sink = new FakeSink()
    const m = new Mirror(sink, () => new Date('2026-10-31T12:00:00.000Z'))
    expect(await m.flush()).toBeUndefined()
    expect(sink.ticks).toHaveLength(0)
    await m.heartbeat()
    expect(sink.ticks).toEqual([{ v: 1, ts: '2026-10-31T12:00:00.000Z', heartbeat: true }])
  })

  it('vaults, credits, agents and health go to their tables and the tick only when they change', async () => {
    const sink = new FakeSink()
    const m = new Mirror(sink)
    m.setVaults([{ vaultId: 'v1', scriptHex: '63ab' }])
    m.setVaultCredits('v1', [{ tokenId: 't_0', amt: '3' }])
    m.setAgents([{ identity: '02a1', name: 'finetune' }])
    m.setHealth({ service: 'coop', ok: true })
    const tick = await m.flush()
    expect(tick?.vaults).toEqual([{ vaultId: 'v1', scriptHex: '63ab' }])
    expect(tick?.vaultCredits).toEqual({ v1: [{ tokenId: 't_0', amt: '3' }] })
    expect(tick?.agents).toEqual([{ identity: '02a1', name: 'finetune' }])
    expect(tick?.health).toEqual([{ service: 'coop', ok: true }])
    expect(sink.rows('live_vaults')[0]).toEqual({ vault_id: 'v1', data: { vaultId: 'v1', scriptHex: '63ab' }, credits: [{ tokenId: 't_0', amt: '3' }] })
    expect(sink.rows('live_health')[0]).toEqual({ service: 'coop', ok: true, detail: null })
    m.setHealth({ service: 'coop', ok: true })
    m.setAgents([{ identity: '02a1', name: 'finetune' }])
    expect(await m.flush()).toBeUndefined()
  })

  it('a failed sink write keeps the changes for the next flush', async () => {
    const sink = new FakeSink()
    const m = new Mirror(sink)
    m.setPools([P('a_0', 'open', [])])
    sink.failNextUpsert = true
    await expect(m.flush()).rejects.toThrow('supabase down')
    const tick = await m.flush()
    expect(tick?.pools?.map(p => p.poolId)).toEqual(['a_0'])
    expect(sink.rows('live_pools').map(r => r.pool_id)).toEqual(['a_0'])
  })
})
