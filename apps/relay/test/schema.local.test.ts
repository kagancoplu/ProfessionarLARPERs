/**
 * Schema and RLS against the local Supabase stack (`supabase start`). Skipped unless SUPABASE_LOCAL_URL,
 * SUPABASE_LOCAL_ANON_KEY and SUPABASE_LOCAL_SECRET_KEY are exported (values from `supabase status -o env`).
 */
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

const url = process.env.SUPABASE_LOCAL_URL
const TABLES = ['live_pools', 'live_pledges', 'live_listings', 'live_vaults', 'live_agents', 'live_health', 'coop_events', 'live_ticks']

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
})
