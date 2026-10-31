/**
 * What the relay reads from the services: the same endpoints the web uses in live mode (coordinator REST,
 * overlay lookup, agents roster) and the same health probes (apps/web/src/events/health.ts).
 */
import { createHash } from 'node:crypto'
import type { HealthRow, Json, VaultOutput } from './contract'
import type { RelayConfig } from './config'

/** The web's ServiceName values, so the web can turn each row into a `service_health` event as-is. */
export type ServiceName = 'coop' | 'overlay' | 'provider' | 'guard' | 'agents' | 'arcade' | 'maker'
export const SERVICES: ServiceName[] = ['coop', 'overlay', 'provider', 'guard', 'agents', 'arcade', 'maker']

interface LookupAnswer { type: string, outputs?: Array<{ outputIndex: number, context?: number[] }> }

export function createSources (urls: RelayConfig['urls'], fetchImpl: typeof fetch = fetch) {
  const getJson = async <T>(url: string, timeoutMs = 10_000): Promise<T> => {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
    return await res.json() as T
  }
  const lookup = async <C>(query: Json): Promise<C[]> => {
    const res = await fetchImpl(`${urls.overlay}/lookup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ service: 'ls_agentcoop', query }),
      signal: AbortSignal.timeout(10_000)
    })
    if (!res.ok) throw new Error(`overlay lookup ${String(query.op)}: HTTP ${res.status}`)
    const answer = await res.json() as LookupAnswer
    if (answer.type !== 'output-list') throw new Error(`unexpected lookup answer: ${answer.type}`)
    return (answer.outputs ?? []).map(o => JSON.parse(Buffer.from(o.context ?? []).toString('utf8')) as C)
  }
  const checks: Record<ServiceName, () => Promise<boolean>> = {
    coop: async () => (await getJson<{ ok: boolean }>(`${urls.coop}/healthz`, 4_000)).ok,
    overlay: async () => 'tm_agentcoop' in await getJson<Json>(`${urls.overlay}/listTopicManagers`, 4_000),
    provider: async () => (await getJson<{ ok: boolean }>(`${urls.provider}/healthz`, 4_000)).ok,
    guard: async () => (await getJson<{ ok: boolean }>(`${urls.guard}/healthz`, 4_000)).ok,
    agents: async () => (await getJson<{ ok: boolean }>(`${urls.agents}/healthz`, 4_000)).ok,
    arcade: async () => (await getJson<{ height: number }>(`${urls.arcade}/chaintracks/v2/height`, 5_000)).height > 0,
    maker: async () => (await getJson<{ ok: boolean }>(`${urls.maker}/healthz`, 4_000)).ok
  }
  return {
    /** coordinator `GET /pools?pledges=1`: every pool with its pledges */
    poolsWithPledges: async () => await getJson<Array<Json & { poolId: string, status: string, pledges?: Json[] }>>(`${urls.coop}/pools?pledges=1`),
    listings: async () => await getJson<Array<Json & { outpoint: string }>>(`${urls.coop}/listings`),
    vaults: async () => await lookup<Json & { vaultId: string, scriptHex: string }>({ op: 'vaults' }),
    /** credits locked to a vault: the overlay indexes them by sha256(vault script) */
    vaultCredits: async (scriptHex: string) => await lookup<VaultOutput>({ op: 'vaultCredits', vaultHash: createHash('sha256').update(Buffer.from(scriptHex, 'hex')).digest('hex') }),
    agents: async () => await getJson<Array<Json & { identity: string }>>(`${urls.agents}/agents`),
    /** never throws: a failure is a row with ok:false and the error message */
    probe: async (service: ServiceName): Promise<HealthRow> => {
      try { return { service, ok: await checks[service]() } } catch (err) { return { service, ok: false, detail: String((err as Error).message ?? err) } }
    }
  }
}

export type Sources = ReturnType<typeof createSources>
