/** Agent event service (MASTER §3.10; requested from Track C). */
import { env } from '../env'
import { getJson, type RequestOptions } from './http'
import type { AgentInfo } from './types'

export function createAgentsApi (base: string) {
  return {
    base,
    list: (o?: RequestOptions) => getJson<AgentInfo[]>(`${base}/agents`, o),
    healthz: (o?: RequestOptions) => getJson<{ ok: boolean }>(`${base}/healthz`, { timeoutMs: 4_000, ...o }),
    eventsUrl: `${base}/events`
  }
}

export type AgentsApi = ReturnType<typeof createAgentsApi>
export const agentsApi: AgentsApi = createAgentsApi(env.urls.agents)
