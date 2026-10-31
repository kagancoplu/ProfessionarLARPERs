/**
 * Ticks from the relay's Supabase mirror (plan/phases/SUPABASE-MVP.md) applied the way the direct adapters
 * apply their data: the same derive functions (so the Town animates the same events) and the same hydrate
 * setters. Pure: tests feed ticks directly; supabaseLive.ts feeds them from Postgres Changes.
 */
import type { HealthRow, LiveTick, VaultOutput } from '@agentcoop/relay/contract'
import type { AgentInfo, ApiPool, Listing, PledgeView, VaultView } from '../../api/types'
import type { ServiceName } from '../../env'
import type { AppStoreApi } from '../../store'
import type { EventBus } from '../bus'
import { deriveListingDiff, derivePledgeDiff, derivePoolDiff } from '../derive'
import { summariseCredits } from '../livePoll'
import { makeEvent, type CoopEvent } from '../types'

/** What the tables hold, read once at start. */
export interface LiveSnapshot {
  pools: ApiPool[]
  pledges: Record<string, PledgeView[]>
  listings: Listing[]
  vaults: VaultView[]
  vaultCredits: Record<string, VaultOutput[]>
  agents: AgentInfo[]
  health: HealthRow[]
}

export function applyTick (bus: EventBus, store: AppStoreApi, tick: LiveTick): void {
  const ts = tick.ts
  const pools = tick.pools as unknown as ApiPool[] | undefined
  if (pools !== undefined) {
    const events = derivePoolDiff(store.getState().pools.byId, pools, ts)
    store.getState().hydratePools(pools, ts)
    for (const e of events) bus.publish(e)
  }
  for (const [poolId, list] of Object.entries((tick.pledges ?? {}) as unknown as Record<string, PledgeView[]>)) {
    for (const e of derivePledgeDiff(store.getState().pools.byId[poolId]?.pledges, list, poolId, ts)) bus.publish(e)
    store.getState().setPledges(poolId, list)
  }
  // pledge_added adds its credits to the pool, but the coordinator's count already includes them: restore it
  if (pools !== undefined && tick.pledges !== undefined) store.getState().hydratePools(pools, ts)
  const listings = tick.listings as unknown as Listing[] | undefined
  if (listings !== undefined) {
    for (const e of deriveListingDiff(store.getState().listings.byOutpoint, listings, ts)) bus.publish(e)
    store.getState().hydrateListings(listings)
  }
  if (tick.vaults !== undefined) store.getState().hydrateVaults(tick.vaults as unknown as VaultView[])
  for (const [vaultId, outputs] of Object.entries(tick.vaultCredits ?? {})) {
    const credits = summariseCredits(outputs)
    if (JSON.stringify(credits) !== JSON.stringify(store.getState().vaults.byId[vaultId]?.credits ?? [])) {
      bus.publish(makeEvent('overlay', 'vault_credits', { vaultId, credits }))
    }
  }
  if (tick.agents !== undefined) store.getState().hydrateAgents(tick.agents as unknown as AgentInfo[], ts)
  for (const row of tick.health ?? []) {
    const current = store.getState().health[row.service as ServiceName]
    if (current === undefined) continue // a service this web does not show (e.g. the relay itself)
    if (current.ok === row.ok && current.detail === row.detail) continue
    bus.publish(makeEvent('web', 'service_health', { service: row.service as ServiceName, ok: row.ok, ...(row.detail !== undefined ? { detail: row.detail } : {}) }))
  }
  for (const e of tick.events ?? []) bus.publish(e as CoopEvent)
}

export function applySnapshot (bus: EventBus, store: AppStoreApi, snap: LiveSnapshot): void {
  applyTick(bus, store, { v: 1, ts: new Date().toISOString(), ...snap } as unknown as LiveTick)
}

/** Earlier events into the store (feed, tx ledger, charts) without the bus: no Town effects or sounds for the past. */
export function hydrateHistory (store: AppStoreApi, events: CoopEvent[]): void {
  for (const e of events) store.getState().applyEvent(e)
}
