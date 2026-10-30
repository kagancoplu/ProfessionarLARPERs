/** Coordinator side API (MASTER §3.5). Read endpoints need no auth. */
import { env } from '../env'
import { getJson, postJson, type RequestOptions } from './http'
import type { ApiPool, CoopHealth, CoopMetrics, Listing, Offer, PledgeView } from './types'

export function createCoopApi (base: string) {
  return {
    base,
    pools: (o?: RequestOptions) => getJson<ApiPool[]>(`${base}/pools`, o),
    poolsWithPledges: (o?: RequestOptions) => getJson<Array<ApiPool & { pledges: PledgeView[] }>>(`${base}/pools?pledges=1`, o),
    offer: (poolId: string, o?: RequestOptions) => getJson<Offer>(`${base}/offers/${poolId}`, o),
    pool: (poolId: string, o?: RequestOptions) => getJson<ApiPool>(`${base}/pools/${poolId}`, o),
    pledges: (poolId: string, all = false, o?: RequestOptions) => getJson<PledgeView[]>(`${base}/pools/${poolId}/pledges${all ? '?all=1' : ''}`, o),
    listings: (tokenId?: string, o?: RequestOptions) => getJson<Listing[]>(`${base}/listings${tokenId !== undefined ? `?tokenId=${encodeURIComponent(tokenId)}` : ''}`, o),
    audit: (poolId: string, o?: RequestOptions) => getJson<unknown>(`${base}/pools/${poolId}/audit`, o),
    metrics: (o?: RequestOptions) => getJson<CoopMetrics>(`${base}/metrics`, o),
    healthz: (o?: RequestOptions) => getJson<CoopHealth>(`${base}/healthz`, { timeoutMs: 4_000, ...o }),
    postOffer: (offer: unknown, o?: RequestOptions) => postJson<{ poolId: string, accepted: boolean }>(`${base}/offers`, offer, o),
    postListing: (listing: Listing, o?: RequestOptions) => postJson<{ outpoint: string, accepted: boolean }>(`${base}/listings`, listing, o)
  }
}

export type CoopApi = ReturnType<typeof createCoopApi>
export const coopApi: CoopApi = createCoopApi(env.urls.coop)
