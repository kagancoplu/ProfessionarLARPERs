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

export function createLiveClient (sb: SupabaseClient): LiveClient {
  return {
    async snapshot (): Promise<LiveSnapshot> {
      const [pools, pledges, listings, vaults, agents, health] = await Promise.all([
        sb.from('live_pools').select('data'),
        sb.from('live_pledges').select('pool_id, data'),
        sb.from('live_listings').select('data'),
        sb.from('live_vaults').select('data, credits'),
        sb.from('live_agents').select('data'),
        sb.from('live_health').select('service, ok, detail')
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
        .subscribe((status, err) => { onStatus(status === 'SUBSCRIBED', err?.message ?? status) })
      return () => { void sb.removeChannel(channel) }
    }
  }
}
