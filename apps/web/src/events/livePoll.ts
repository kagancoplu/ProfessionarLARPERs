/**
 * Live mode: what no event stream announces, polled (found in the P6 cleanup: listings, the agents' roster and
 * vaults were never loaded in live mode). Listings go through deriveListingDiff so the Town's stalls animate;
 * agents and vaults are hydrated. Each source fails quietly (health polling already reports the service).
 */
import type { EventBus } from './bus'
import { deriveListingDiff } from './derive'
import type { AppStoreApi } from '../store'
import type { AgentInfo, Listing, VaultView } from '../api/types'

export interface LivePollSources {
  listings: () => Promise<Listing[]>
  agents: () => Promise<AgentInfo[]>
  vaults: () => Promise<VaultView[]>
}

export interface LivePollOptions { listingsMs?: number, agentsMs?: number, vaultsMs?: number, setIntervalImpl?: typeof setInterval, clearIntervalImpl?: typeof clearInterval }

export async function pollListings (bus: EventBus, store: AppStoreApi, src: LivePollSources): Promise<void> {
  const next = await src.listings()
  for (const e of deriveListingDiff(store.getState().listings.byOutpoint, next, new Date().toISOString())) bus.publish(e)
  store.getState().hydrateListings(next)
}

export async function pollAgents (store: AppStoreApi, src: LivePollSources): Promise<void> { store.getState().hydrateAgents(await src.agents()) }
export async function pollVaults (store: AppStoreApi, src: LivePollSources): Promise<void> { store.getState().hydrateVaults(await src.vaults()) }

export function startLivePolling (bus: EventBus, store: AppStoreApi, src: LivePollSources, opts: LivePollOptions = {}): () => void {
  const every = opts.setIntervalImpl ?? setInterval
  const stop = opts.clearIntervalImpl ?? clearInterval
  const quiet = (p: Promise<void>): void => { void p.catch(() => {}) }
  const runAll = (): void => { quiet(pollListings(bus, store, src)); quiet(pollAgents(store, src)); quiet(pollVaults(store, src)) }
  runAll()
  const timers = [
    every(() => quiet(pollListings(bus, store, src)), opts.listingsMs ?? 10_000),
    every(() => quiet(pollAgents(store, src)), opts.agentsMs ?? 30_000),
    every(() => quiet(pollVaults(store, src)), opts.vaultsMs ?? 20_000)
  ]
  return () => { for (const t of timers) stop(t) }
}
