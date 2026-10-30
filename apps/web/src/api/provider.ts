/** Provider API (MASTER §3.6). Everything but /healthz is BRC-103 authenticated: pass AuthFetch as fetchImpl. */
import { env } from '../env'
import { getJson, postJson, type RequestOptions } from './http'
import type { Catalog, ProviderJob } from './types'

export function createProviderApi (base: string) {
  return {
    base,
    healthz: (o?: RequestOptions) => getJson<{ ok: boolean }>(`${base}/healthz`, { timeoutMs: 4_000, ...o }),
    catalog: (o?: RequestOptions) => getJson<Catalog>(`${base}/v1/catalog`, o),
    job: (id: string, o?: RequestOptions) => getJson<ProviderJob>(`${base}/v1/jobs/${id}`, o),
    submitJob: (body: { kind: string, minutes: number, product?: string }, o?: RequestOptions) => postJson<{ jobId: string, status: string, payment: unknown }>(`${base}/v1/jobs`, body, o),
    balance: (o?: RequestOptions) => getJson<{ identity: string, balances: Array<{ product: string, tokenId: string, minutesPerCredit: number, prepaidMinutes: number, returnableCredits: number }> }>(`${base}/v1/credits/balance`, o)
  }
}

export type ProviderApi = ReturnType<typeof createProviderApi>
export const providerApi: ProviderApi = createProviderApi(env.urls.provider)
