/** One supabase-js client for the live mirror and the Town's presence channel, loaded only when the transport is 'supabase'. */
import type { SupabaseClient } from '@supabase/supabase-js'
import { env } from '../env'

let client: Promise<SupabaseClient | undefined> | undefined

export function getSupabase (): Promise<SupabaseClient | undefined> {
  const cfg = env.supabase
  if (env.transport !== 'supabase' || cfg === undefined) return Promise.resolve(undefined)
  client ??= import('@supabase/supabase-js')
    .then(m => m.createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } }))
    .catch(err => { console.error('[supabase] client failed to load', err); return undefined })
  return client
}
