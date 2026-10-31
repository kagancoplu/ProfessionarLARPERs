/**
 * Schema and RLS against the local Supabase stack (`supabase start`). Skipped unless SUPABASE_LOCAL_URL,
 * SUPABASE_LOCAL_ANON_KEY and SUPABASE_LOCAL_SECRET_KEY are exported (values from `supabase status -o env`).
 * CI's `supabase-rls` job sets SUPABASE_LOCAL_REQUIRED=1, so a missing stack fails instead of skipping (T-22).
 */
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

const url = process.env.SUPABASE_LOCAL_URL
if (process.env.SUPABASE_LOCAL_REQUIRED === '1' && url === undefined) throw new Error('SUPABASE_LOCAL_REQUIRED=1 but SUPABASE_LOCAL_URL is not set')
const TABLES = ['live_pools', 'live_pledges', 'live_listings', 'live_vaults', 'live_agents', 'live_health', 'coop_events', 'live_ticks']
/** One valid row per table and the column that identifies it (ids prefixed so a cleanup never hits real rows). */
const ROWS: Record<string, { key: string, row: Record<string, unknown> }> = {
  live_pools: { key: 'pool_id', row: { pool_id: 'rls_test_0', status: 'open', data: {} } },
  live_pledges: { key: 'outpoint', row: { outpoint: 'rls_test_0', pool_id: 'rls_test_0', data: {} } },
  live_listings: { key: 'outpoint', row: { outpoint: 'rls_test_0', data: {} } },
  live_vaults: { key: 'vault_id', row: { vault_id: 'rls_test', data: {} } },
  live_agents: { key: 'identity', row: { identity: 'rls_test', data: {} } },
  live_health: { key: 'service', row: { service: 'rls_test', ok: true } },
  coop_events: { key: 'uid', row: { uid: 'rls_test', id: 'rls_test', ts: new Date().toISOString(), src: 'test', type: 'test', envelope: {} } },
  live_ticks: { key: 'tick->>t', row: { tick: { t: 'rls_test' } } }
}

describe.skipIf(url === undefined)('supabase schema (local stack)', () => {
  // built inside the tests: createClient throws on an empty URL even when the suite is skipped
  const client = (key: string | undefined) => createClient(url ?? '', key ?? '', { auth: { persistSession: false } })

  it('anon reads every live table', async () => {
    const anon = client(process.env.SUPABASE_LOCAL_ANON_KEY)
    for (const t of TABLES) expect((await anon.from(t).select('*').limit(1)).error, t).toBeNull()
  })

  it('anon cannot write; the secret key can', async () => {
    const anon = client(process.env.SUPABASE_LOCAL_ANON_KEY)
    const secret = client(process.env.SUPABASE_LOCAL_SECRET_KEY)
    expect((await anon.from('live_pools').insert({ pool_id: 'x_0', status: 'open', data: {} })).error).not.toBeNull()
    expect((await secret.from('live_pools').upsert({ pool_id: 'x_0', status: 'open', data: {} })).error).toBeNull()
    await secret.from('live_pools').delete().eq('pool_id', 'x_0')
  })

  it('BL-34 #13: an update stamps updated_at', async () => {
    const secret = client(process.env.SUPABASE_LOCAL_SECRET_KEY)
    try {
      await secret.from('live_health').upsert({ service: 'touch_test', ok: true })
      const first = (await secret.from('live_health').select('updated_at').eq('service', 'touch_test').single()).data?.updated_at as string
      await new Promise(r => setTimeout(r, 20))
      await secret.from('live_health').upsert({ service: 'touch_test', ok: false })
      const second = (await secret.from('live_health').select('updated_at').eq('service', 'touch_test').single()).data?.updated_at as string
      expect(Date.parse(second)).toBeGreaterThan(Date.parse(first))
    } finally {
      await secret.from('live_health').delete().eq('service', 'touch_test')
    }
  })

  it('T-22: on every table anon can neither insert, update nor delete', async () => {
    const anon = client(process.env.SUPABASE_LOCAL_ANON_KEY)
    const secret = client(process.env.SUPABASE_LOCAL_SECRET_KEY)
    const id = (t: string): string => String(ROWS[t].key === 'tick->>t' ? 'rls_test' : ROWS[t].row[ROWS[t].key])
    const count = async (t: string): Promise<number> => (await secret.from(t).select('*', { count: 'exact', head: true }).eq(ROWS[t].key, id(t))).count ?? -1
    try {
      for (const t of TABLES) {
        // insert: refused outright by RLS (42501), not by a constraint on a bad row
        expect((await anon.from(t).insert(ROWS[t].row)).error?.code, `${t} anon insert`).toBe('42501')
        expect((await secret.from(t).insert(ROWS[t].row)).error, `${t} secret insert`).toBeNull()
        // update and delete: no policy, so they match no rows and the row stays as it was
        await anon.from(t).update(t === 'live_health' ? { ok: false } : t === 'live_ticks' ? { tick: { t: 'changed' } } : { data: { changed: true } }).eq(ROWS[t].key, id(t))
        await anon.from(t).delete().eq(ROWS[t].key, id(t))
        expect(await count(t), `${t} row after anon update + delete`).toBe(1)
      }
      const health = await secret.from('live_health').select('ok').eq('service', 'rls_test').single()
      expect(health.data?.ok).toBe(true)
    } finally {
      for (const t of TABLES) await secret.from(t).delete().eq(ROWS[t].key, id(t))
    }
  })
})
