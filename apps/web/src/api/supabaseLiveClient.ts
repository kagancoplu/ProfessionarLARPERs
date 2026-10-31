/** The relay's Supabase mirror read with supabase-js (anon key; RLS allows select only). No env import, so tests build it directly. */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { HealthRow, LiveTick, VaultOutput } from '@agentcoop/relay/contract'
import type { LiveClient } from '../events/adapters/supabaseLive'
import type { LiveSnapshot } from '../events/adapters/supabaseApply'
import type { CoopEvent } from '../events/types'
import type { AgentInfo, ApiPool, Listing, PledgeView, VaultView } from './types'

const rows = <T>(what: string, res: { data: T[] | null, error: { message: string } | null }): T[] => {
  if (res.error !== null) throw new Error(`Supabase ${what}: ${res.error.message}`)
  return res.data ?? []
}

export function createLiveClient (sb: SupabaseClient, opts: { pageSize?: number } = {}): LiveClient {
  // PostgREST caps one read at max_rows (1000 by default): page through, ordered by the primary key
  const pageSize = opts.pageSize ?? 1000
  const all = async <T>(table: string, columns: string, key: string): Promise<{ data: T[], error: { message: string } | null }> => {
    const out: T[] = []
    for (let from = 0; ; from += pageSize) {
      const res = await sb.from(table).select(columns).order(key).range(from, from + pageSize - 1)
      if (res.error !== null) return { data: out, error: res.error }
      const page = (res.data ?? []) as T[]
      out.push(...page)
      if (page.length < pageSize) return { data: out, error: null }
    }
  }
  return {
    async snapshot (): Promise<LiveSnapshot> {
      const [pools, pledges, listings, vaults, agents, health] = await Promise.all([
        all<{ data: ApiPool }>('live_pools', 'data', 'pool_id'),
        all<{ pool_id: string, data: PledgeView }>('live_pledges', 'pool_id, data', 'outpoint'),
        all<{ data: Listing }>('live_listings', 'data', 'outpoint'),
        all<{ data: VaultView, credits: VaultOutput[] | null }>('live_vaults', 'data, credits', 'vault_id'),
        all<{ data: AgentInfo }>('live_agents', 'data', 'identity'),
        all<{ service: string, ok: boolean, detail: string | null }>('live_health', 'service, ok, detail', 'service')
      ])
      const byPool: Record<string, PledgeView[]> = {}
      for (const r of rows<{ pool_id: string, data: PledgeView }>('pledges', pledges)) (byPool[r.pool_id] ??= []).push(r.data)
      const vaultRows = rows<{ data: VaultView, credits: VaultOutput[] | null }>('vaults', vaults)
      return {
        pools: rows<{ data: ApiPool }>('pools', pools).map(r => r.data),
        pledges: byPool,
        listings: rows<{ data: Listing }>('listings', listings).map(r => r.data),
        vaults: vaultRows.map(r => r.data),
        vaultCredits: Object.fromEntries(vaultRows.filter(r => r.credits !== null).map(r => [r.data.vaultId, r.credits ?? []])),
        agents: rows<{ data: AgentInfo }>('agents', agents).map(r => r.data),
        health: rows<{ service: string, ok: boolean, detail: string | null }>('health', health)
          .map((h): HealthRow => ({ service: h.service, ok: h.ok, ...(h.detail !== null ? { detail: h.detail } : {}) }))
      }
    },
    async history (limit: number): Promise<CoopEvent[]> {
      const res = await sb.from('coop_events').select('envelope').order('ts', { ascending: false }).limit(limit)
      return rows<{ envelope: CoopEvent }>('history', res).map(r => r.envelope).reverse()
    },
    subscribeTicks (onTick, onStatus) {
      const channel = sb.channel(`live-ticks-${Math.random().toString(36).slice(2, 10)}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_ticks' }, p => { onTick((p.new as { tick: LiveTick }).tick) })
        .subscribe((status, err) => { onStatus(status === 'SUBSCRIBED', err !== undefined ? `${status}: ${err.message}` : status) })
      return () => { void sb.removeChannel(channel) }
    }
  }
}
