/**
 * The Supabase sink against the local stack (`supabase start`); skipped unless SUPABASE_LOCAL_* is exported
 * (see schema.local.test.ts).
 */
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import type { LiveTick } from '../src/contract'
import { createSupabaseSink } from '../src/supabaseSink'

const url = process.env.SUPABASE_LOCAL_URL
if (process.env.SUPABASE_LOCAL_REQUIRED === '1' && url === undefined) throw new Error('SUPABASE_LOCAL_REQUIRED=1 but SUPABASE_LOCAL_URL is not set')

describe.skipIf(url === undefined)('supabase sink (local stack)', () => {
  const anon = () => createClient(url ?? '', process.env.SUPABASE_LOCAL_ANON_KEY ?? '', { auth: { persistSession: false } })
  const sink = () => createSupabaseSink(url ?? '', process.env.SUPABASE_LOCAL_SECRET_KEY ?? '')

  it('a tick published by the sink reaches an anon Postgres Changes subscriber', async () => {
    const client = anon()
    const got: LiveTick[] = []
    const subscribed = new Promise<void>((resolve, reject) => {
      client.channel('test-ticks')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_ticks' }, p => { got.push((p.new as { tick: LiveTick }).tick) })
        .subscribe(status => { if (status === 'SUBSCRIBED') resolve(); else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(status)) })
    })
    await subscribed
    // SUBSCRIBED can come before Realtime's replication is listening (a cold stack in CI missed the first
    // insert): publish a tick every 500 ms until one arrives, for at most 20 s
    const sent = new Set<string>()
    for (let i = 0; i < 40 && got.length === 0; i++) {
      const ts = new Date().toISOString()
      sent.add(ts)
      await sink().publishTick({ v: 1, ts, heartbeat: true })
      for (let j = 0; j < 10 && got.length === 0; j++) await new Promise(r => setTimeout(r, 50))
    }
    await client.removeAllChannels()
    expect(got.find(t => sent.has(t.ts))?.heartbeat).toBe(true)
  })

  it('anon cannot insert a tick (RLS)', async () => {
    expect((await anon().from('live_ticks').insert({ tick: { v: 1, ts: 'x' } })).error).not.toBeNull()
  })

  it('deleteListingsExcept keeps only the given outpoints', async () => {
    const s = sink()
    await s.upsert('live_listings', [{ outpoint: 'k1_0', data: {} }, { outpoint: 'k2_0', data: {} }])
    await s.deleteListingsExcept(['k2_0'])
    const { data } = await anon().from('live_listings').select('outpoint').in('outpoint', ['k1_0', 'k2_0'])
    expect(data?.map(r => r.outpoint)).toEqual(['k2_0'])
    await s.deleteListingsExcept([])
    expect((await anon().from('live_listings').select('outpoint')).data).toEqual([])
  })

  it('insertEvents ignores an event already stored', async () => {
    const s = sink()
    const e = { id: 'sink-test:1', ts: '2026-10-31T12:00:00.000Z', src: 'guard', type: 'cosign_denied', data: { agent: '02a1', kind: 'pay', reason: 'cap' }, agent: '02a1' }
    await s.insertEvents([e])
    await s.insertEvents([e])
    const { data } = await anon().from('coop_events').select('uid, type, agent').eq('id', 'sink-test:1')
    expect(data).toEqual([{ uid: 'guard|sink-test:1|2026-10-31T12:00:00.000Z', type: 'cosign_denied', agent: '02a1' }])
    await createClient(url ?? '', process.env.SUPABASE_LOCAL_SECRET_KEY ?? '', { auth: { persistSession: false } }).from('coop_events').delete().eq('id', 'sink-test:1')
  })
})
