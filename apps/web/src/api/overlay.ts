/**
 * Overlay lookup (MASTER §3.8): POST /lookup { service: 'ls_agentcoop', query } → output-list whose
 * `context` bytes are UTF-8 JSON (the views in api/types). Decoded here without the SDK, so this
 * module stays tiny; flows that need the BEEF use @agentcoop/core's OverlayClient instead.
 */
import { env } from '../env'
import { postJson, type RequestOptions } from './http'
import type { PledgeView, PoolView, SettlementView, VaultView } from './types'

export const COOP_SERVICE = 'ls_agentcoop'

export type OverlayQuery =
  | { op: 'pools', status?: 'open' | 'settled' | 'cancelled' }
  | { op: 'pool', poolId: string }
  | { op: 'pledges', poolId: string, includeSpent?: boolean, includeInvalid?: boolean }
  | { op: 'settlement', poolId: string }
  | { op: 'listings', tokenId?: string }
  | { op: 'vaults', owner?: string, includeUnverified?: boolean }
  | { op: 'vault', vaultId: string }
  | { op: 'vaultCredits', vaultHash: string, tokenId?: string, includeSpent?: boolean }
  | { op: 'identity', identityKey: string }
  | { op: 'outpoint', outpoint: string }

interface RawOutput { beef: number[], outputIndex: number, context?: number[] }
interface LookupAnswer { type: string, outputs?: RawOutput[], message?: string }

export interface OverlayOutput<C> { beef: number[], outputIndex: number, ctx: C }

const utf8 = (bytes: number[]): string => new TextDecoder().decode(Uint8Array.from(bytes))

export function createOverlayApi (base: string) {
  async function lookup<C> (query: OverlayQuery, o?: RequestOptions): Promise<Array<OverlayOutput<C>>> {
    const answer = await postJson<LookupAnswer>(`${base}/lookup`, { service: COOP_SERVICE, query }, o)
    if (answer.type !== 'output-list') throw new Error(`unexpected lookup answer: ${answer.type}`)
    return (answer.outputs ?? []).map(out => ({ beef: out.beef, outputIndex: out.outputIndex, ctx: JSON.parse(utf8(out.context ?? [])) as C }))
  }
  return {
    base,
    lookup,
    pools: async (status?: 'open' | 'settled' | 'cancelled') => (await lookup<PoolView>({ op: 'pools', ...(status !== undefined ? { status } : {}) })).map(o => o.ctx),
    pledges: async (poolId: string, opts: { includeSpent?: boolean, includeInvalid?: boolean } = {}) => (await lookup<PledgeView>({ op: 'pledges', poolId, ...opts })).map(o => o.ctx),
    settlement: async (poolId: string) => (await lookup<SettlementView>({ op: 'settlement', poolId })).map(o => o.ctx)[0],
    vaults: async (owner?: string) => (await lookup<VaultView>({ op: 'vaults', ...(owner !== undefined ? { owner } : {}) })).map(o => o.ctx),
    /** credit outputs locked to a vault script (A-P5): vaultHash = sha256(vault script) hex */
    vaultCredits: async (vaultHash: string) => (await lookup<{ tokenId: string, amt: string, sym?: string, spent: boolean }>({ op: 'vaultCredits', vaultHash })).map(o => o.ctx),
    /** liveness: overlay-express lists its topic managers */
    healthz: async (o?: RequestOptions) => {
      const res = await (o?.fetchImpl ?? fetch)(`${base}/listTopicManagers`, { signal: AbortSignal.timeout(o?.timeoutMs ?? 4_000) })
      const topics = await res.json() as Record<string, unknown>
      return { ok: res.ok && 'tm_agentcoop' in topics, topics: Object.keys(topics) }
    }
  }
}

export type OverlayApi = ReturnType<typeof createOverlayApi>
export const overlayApi: OverlayApi = createOverlayApi(env.urls.overlay)
