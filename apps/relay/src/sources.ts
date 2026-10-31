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

/**
 * What anonymous readers of `live_health.detail` may see (F-8): a short class of failure, never the error text,
 * which carries internal URLs and hostnames. The full message goes to the relay's own log.
 */
export function publicDetail (err: unknown): string {
  const e = err as { name?: string, message?: string, cause?: { code?: string } }
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return 'timeout'
  const status = /HTTP (\d{3})\b/.exec(e?.message ?? '')?.[1]
  if (status !== undefined) return `HTTP ${status}`
  if (e?.name === 'SyntaxError') return 'bad answer'
  return 'unreachable'
}

interface LookupAnswer { type: string, outputs?: Array<{ outputIndex: number, context?: number[] }> }

export function createSources (urls: RelayConfig['urls'], fetchImpl: typeof fetch = fetch, log: (line: string) => void = () => {}) {
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
    /** every pool with ALL its pledges (`?all=1`, as the web's direct mode reads them): withdrawn and settled
     *  pledges stay in the list with spent=true, so browsers see pledge_cancelled and stale rows are updated */
    poolsWithPledges: async () => {
      const pools = await getJson<Array<Json & { poolId: string, status: string }>>(`${urls.coop}/pools`)
      return await Promise.all(pools.map(async p => ({ ...p, pledges: await getJson<Json[]>(`${urls.coop}/pools/${p.poolId}/pledges?all=1`) })))
    },
    listings: async () => await getJson<Array<Json & { outpoint: string }>>(`${urls.coop}/listings`),
    vaults: async () => await lookup<Json & { vaultId: string, scriptHex: string }>({ op: 'vaults' }),
    /** credits locked to a vault: the overlay indexes them by sha256(vault script) */
    vaultCredits: async (scriptHex: string) => await lookup<VaultOutput>({ op: 'vaultCredits', vaultHash: createHash('sha256').update(Buffer.from(scriptHex, 'hex')).digest('hex') }),
    agents: async () => await getJson<Array<Json & { identity: string }>>(`${urls.agents}/agents`),
    /** never throws: a failure is a row with ok:false and a public detail (publicDetail); the message is logged */
    probe: async (service: ServiceName): Promise<HealthRow> => {
      try { return { service, ok: await checks[service]() } } catch (err) {
        log(`probe ${service}: ${String((err as Error).message ?? err)}`)
        return { service, ok: false, detail: publicDetail(err) }
      }
    }
  }
}

export type Sources = ReturnType<typeof createSources>
