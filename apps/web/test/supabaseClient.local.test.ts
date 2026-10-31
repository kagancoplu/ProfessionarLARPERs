/**
 * createLiveClient against the local Supabase stack; skipped unless SUPABASE_LOCAL_* is exported
 * (apps/relay/README.md "Tests").
 */
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { createLiveClient } from '../src/api/supabaseLiveClient'

const url = process.env.SUPABASE_LOCAL_URL

describe.skipIf(url === undefined)('createLiveClient (local stack)', () => {
  const opts = { auth: { persistSession: false } }
  const secret = () => createClient(url ?? '', process.env.SUPABASE_LOCAL_SECRET_KEY ?? '', opts)
  const anon = () => createClient(url ?? '', process.env.SUPABASE_LOCAL_ANON_KEY ?? '', opts)

  it('snapshot groups pledges by pool and returns vault credits by vault', async () => {
    const db = secret()
    await db.from('live_pools').upsert({ pool_id: 'w_0', status: 'open', data: { poolId: 'w_0', status: 'open' } })
    await db.from('live_pledges').upsert([{ outpoint: 'p1_0', pool_id: 'w_0', data: { outpoint: 'p1_0' } }, { outpoint: 'p2_0', pool_id: 'w_0', data: { outpoint: 'p2_0' } }])
    await db.from('live_vaults').upsert({ vault_id: 'wv', data: { vaultId: 'wv' }, credits: [{ tokenId: 't_0', amt: '1' }] })
    await db.from('live_health').upsert({ service: 'coop', ok: true, detail: null })
    const snap = await createLiveClient(anon()).snapshot()
    expect(snap.pools.find(p => p.poolId === 'w_0')).toEqual({ poolId: 'w_0', status: 'open' })
    expect(snap.pledges.w_0?.map(p => p.outpoint).sort()).toEqual(['p1_0', 'p2_0'])
    expect(snap.vaultCredits.wv).toEqual([{ tokenId: 't_0', amt: '1' }])
    expect(snap.health.find(h => h.service === 'coop')).toEqual({ service: 'coop', ok: true })
    await db.from('live_pledges').delete().eq('pool_id', 'w_0')
    await db.from('live_pools').delete().eq('pool_id', 'w_0')
    await db.from('live_vaults').delete().eq('vault_id', 'wv')
  })

  it('history returns the latest events oldest first', async () => {
    const db = secret()
    const ev = (n: number) => ({ id: `web-test:${n}`, ts: `2030-01-01T00:00:0${n}.000Z`, src: 'agents', type: 'agent_thought', data: { text: String(n) } })
    await db.from('coop_events').upsert([1, 2, 3].map(n => ({ uid: `agents|web-test:${n}`, id: `web-test:${n}`, ts: ev(n).ts, src: 'agents', type: 'agent_thought', envelope: ev(n) })))
    const h = await createLiveClient(anon()).history(2)
    expect(h.map(e => e.id)).toEqual(['web-test:2', 'web-test:3'])
    await db.from('coop_events').delete().like('id', 'web-test:%')
  })
})
