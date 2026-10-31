/**
 * The relay's wiring (plan/phases/SUPABASE-MVP.md, Task 3/4): the services' streams and snapshots into the
 * Mirror, the Mirror into Supabase at most once a second. Dependencies are injected so tests run without network.
 */
import type { CoopEnvelope, Json } from './contract'
import type { RelayConfig } from './config'
import type { followSse as FollowSse } from './sse'
import type { watchCoordinator as WatchCoordinator } from './coordinator'
import { Mirror } from './mirror'
import type { Sink } from './sink'
import { SERVICES, type Sources } from './sources'

export interface RelayDeps {
  sink: Sink
  sources: Sources
  followSse: typeof FollowSse
  watchCoordinator: typeof WatchCoordinator
  now?: () => Date
}

export interface RelayTimings { debounceMs: number, reconcileMs: number, agentsMs: number, probeMs: number, flushMs: number, heartbeatMs: number, pruneMs: number }

const DEFAULT_TIMINGS: RelayTimings = { debounceMs: 300, reconcileMs: 30_000, agentsMs: 30_000, probeMs: 15_000, flushMs: 1_000, heartbeatMs: 15_000, pruneMs: 60_000 }
const TICK_RETENTION_MS = 600_000

const isEnvelope = (x: unknown): x is CoopEnvelope => {
  const e = x as Record<string, unknown> | null
  return typeof e === 'object' && e !== null && typeof e.id === 'string' && typeof e.ts === 'string' && typeof e.src === 'string' && typeof e.type === 'string' && 'data' in e
}

const quiet = (label: string) => (err: unknown): void => { console.error(`[relay] ${label}: ${String((err as Error).message ?? err)}`) }

export function startRelay (urls: RelayConfig['urls'], deps: RelayDeps, timings: Partial<RelayTimings> = {}): { stop: () => Promise<void> } {
  const t = { ...DEFAULT_TIMINGS, ...timings }
  const now = deps.now ?? (() => new Date())
  const mirror = new Mirror(deps.sink, now)
  const src = deps.sources
  const stops: Array<() => void> = []
  const every = (ms: number, fn: () => void): void => { const id = setInterval(fn, ms); stops.push(() => clearInterval(id)) }

  // pools + pledges, listings, vaults and their credits: one pass, each source failing on its own
  const refresh = async (): Promise<void> => {
    await Promise.all([
      src.poolsWithPledges().then(p => mirror.setPools(p), quiet('pools')),
      src.listings().then(l => mirror.setListings(l), quiet('listings')),
      src.vaults().then(async vaults => {
        mirror.setVaults(vaults)
        for (const v of vaults) mirror.setVaultCredits(v.vaultId, await src.vaultCredits(v.scriptHex))
      }).catch(quiet('vaults'))
    ])
  }
  let debounce: ReturnType<typeof setTimeout> | undefined
  const refreshSoon = (): void => {
    if (debounce !== undefined) clearTimeout(debounce)
    debounce = setTimeout(() => { void refresh() }, t.debounceMs)
  }
  stops.push(() => { if (debounce !== undefined) clearTimeout(debounce) })
  const agents = async (): Promise<void> => { await src.agents().then(a => mirror.setAgents(a), quiet('agents')) }
  const probe = async (): Promise<void> => { for (const row of await Promise.all(SERVICES.map(s => src.probe(s)))) mirror.setHealth(row) }

  const overlay = deps.followSse(`${urls.overlay}/agentcoop/events`, data => {
    let msg: { type?: unknown, txid?: unknown }
    try { msg = JSON.parse(data) } catch { return }
    if ((msg.type !== 'admitted' && msg.type !== 'spent') || typeof msg.txid !== 'string') return
    mirror.pushEvent({ id: `overlay:${msg.type}:${msg.txid}`, ts: now().toISOString(), src: 'overlay', type: msg.type, data: { txid: msg.txid }, txid: msg.txid })
    refreshSoon()
  })
  stops.push(overlay.close)
  // guard, agents and maker already speak the envelope (MASTER §3.10)
  for (const url of [`${urls.guard}/events`, `${urls.agents}/events`, `${urls.maker}/events`]) {
    stops.push(deps.followSse(url, data => {
      let e: unknown
      try { e = JSON.parse(data) } catch { return }
      if (isEnvelope(e)) mirror.pushEvent(e)
    }).close)
  }
  // the coordinator's broadcasts, for history only: the web keeps its own WS (signing rounds, settled → afterSettlement)
  stops.push(deps.watchCoordinator(`${urls.coop.replace(/^http/, 'ws')}/ws`, (msg: Json) => {
    const { type, ...data } = msg
    if (typeof type !== 'string') return
    const poolId = typeof data.poolId === 'string' ? data.poolId : undefined
    const txid = typeof data.txid === 'string' ? data.txid : undefined
    const ts = now().toISOString()
    mirror.pushEvent({ id: `coordinator:${type}:${poolId ?? ''}:${txid ?? String(data.round ?? data.pledgedCredits ?? '')}`, ts, src: 'coordinator', type, data, ...(poolId !== undefined ? { poolId } : {}), ...(txid !== undefined ? { txid } : {}) }, { live: false })
  }).close)

  let flushing = false
  const flush = async (): Promise<void> => {
    if (flushing) return
    flushing = true
    try { await mirror.flush() } catch (err) { quiet('flush (kept for the next one)')(err) } finally { flushing = false }
  }
  void refresh(); void agents(); void probe()
  every(t.reconcileMs, () => { void refresh() })
  every(t.agentsMs, () => { void agents() })
  every(t.probeMs, () => { void probe() })
  every(t.flushMs, () => { void flush() })
  every(t.heartbeatMs, () => { void mirror.heartbeat().catch(quiet('heartbeat')) })
  every(t.pruneMs, () => { void deps.sink.pruneTicks(TICK_RETENTION_MS).catch(quiet('prune')) })

  return {
    stop: async () => {
      for (const s of stops) s()
      await flush()
    }
  }
}
