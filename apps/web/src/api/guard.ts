/** Guard API (MASTER §3.7). /healthz and /events are public; policies and decisions need AuthFetch. */
import { env } from '../env'
import { getJson, putJson, type RequestOptions } from './http'
import type { GuardDecision, GuardHealth, GuardPolicy, GuardPolicyResponse } from './types'

export function createGuardApi (base: string) {
  return {
    base,
    healthz: (o?: RequestOptions) => getJson<GuardHealth>(`${base}/healthz`, { timeoutMs: 4_000, ...o }),
    policy: (agent: string, o?: RequestOptions) => getJson<GuardPolicyResponse>(`${base}/policies/${agent}`, o),
    putPolicy: (agent: string, policy: GuardPolicy, o?: RequestOptions) => putJson<unknown>(`${base}/policies/${agent}`, policy, o),
    decisions: (agent?: string, limit = 50, o?: RequestOptions) => getJson<{ agent?: string, decisions: GuardDecision[] }>(`${base}/decisions?${agent !== undefined ? `agent=${agent}&` : ''}limit=${limit}`, o),
    eventsUrl: `${base}/events`
  }
}

export type GuardApi = ReturnType<typeof createGuardApi>
export const guardApi: GuardApi = createGuardApi(env.urls.guard)
