/**
 * TanStack Query layer: REST reads hydrate the store; events invalidate the matching keys
 * (track-E §2.1 "queries → state, events → state"). Keys live here so adapters and
 * components agree on them.
 */
import { QueryClient, useQuery } from '@tanstack/react-query'
import type { AnyCoopEvent } from '../events/types'
import { store } from '../store'
import { agentsApi } from './agents'
import { coopApi } from './coop'

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000, refetchOnWindowFocus: false } }
})

export const keys = {
  pools: ['pools'] as const,
  pool: (id: string) => ['pool', id] as const,
  pledges: (id: string) => ['pledges', id] as const,
  listings: ['listings'] as const,
  agents: ['agents'] as const,
  metrics: ['metrics'] as const
}

export function usePools () {
  return useQuery({
    queryKey: keys.pools,
    queryFn: async () => { const pools = await coopApi.pools(); store.getState().hydratePools(pools); return pools },
    refetchInterval: 30_000
  })
}

export function usePledges (poolId: string | undefined) {
  return useQuery({
    queryKey: keys.pledges(poolId ?? ''),
    enabled: poolId !== undefined,
    queryFn: async () => { const pledges = await coopApi.pledges(poolId!, true); store.getState().setPledges(poolId!, pledges); return pledges }
  })
}

export function useListings () {
  return useQuery({
    queryKey: keys.listings,
    queryFn: async () => { const listings = await coopApi.listings(); store.getState().hydrateListings(listings); return listings }
  })
}

export function useAgents () {
  return useQuery({
    queryKey: keys.agents,
    queryFn: async () => { const agents = await agentsApi.list(); store.getState().hydrateAgents(agents); return agents },
    retry: 0
  })
}

/** Which cached reads an event makes stale. */
export function invalidateFor (client: QueryClient, e: AnyCoopEvent): void {
  switch (e.type) {
    case 'pool_update': case 'settled': case 'pool_failed': case 'round_failed': case 'pool_opened': case 'pool_settled': case 'pool_cancelled':
      void client.invalidateQueries({ queryKey: keys.pools })
      if (e.poolId !== undefined) void client.invalidateQueries({ queryKey: keys.pool(e.poolId) })
      break
    case 'pledge_added': case 'pledge_cancelled':
      void client.invalidateQueries({ queryKey: keys.pools })
      void client.invalidateQueries({ queryKey: keys.pledges(e.data.pledge.poolId) })
      break
    case 'listing_added': case 'listing_filled': case 'listing_cancelled':
      void client.invalidateQueries({ queryKey: keys.listings })
      break
    case 'agent_started':
      void client.invalidateQueries({ queryKey: keys.agents })
      break
    default:
      break
  }
}
