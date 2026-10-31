/**
 * Ticks from the relay's Supabase mirror (plan/phases/SUPABASE-MVP.md) applied the way the direct adapters
 * apply their data: the same derive functions (so the Town animates the same events) and the same hydrate
 * setters. Pure: tests feed ticks directly; supabaseLive.ts feeds them from Postgres Changes.
 */
import type { HealthRow, LiveTick, VaultOutput } from '@agentcoop/relay/contract'
import type { AgentInfo, ApiPool, Listing, PledgeView, VaultView } from '../../api/types'
import type { ServiceName } from '../../env'
import type { AppStoreApi } from '../../store'
import type { EventBus } from '../bus'
import { deriveListingDiff, derivePledgeDiff, derivePoolDiff } from '../derive'
import { summariseCredits } from '../livePoll'
import { makeEvent, type CoopEvent } from '../types'

/** What the tables hold, read once at start. */
export interface LiveSnapshot {
  pools: ApiPool[]
  pledges: Record<string, PledgeView[]>
  listings: Listing[]
  vaults: VaultView[]
  vaultCredits: Record<string, VaultOutput[]>
  agents: AgentInfo[]
  health: HealthRow[]
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const withKey = (k: string) => (x: unknown): boolean => isObj(x) && typeof x[k] === 'string'

/**
 * A tick as it came off the wire, or undefined if it is not one (BL-34 #4): a truncated or malformed payload must
 * not reach the reducers. Malformed entries inside a valid tick are dropped one by one.
 */
export function sanitizeTick (raw: unknown): LiveTick | undefined {
  if (!isObj(raw) || raw.v !== 1 || typeof raw.ts !== 'string' || Number.isNaN(Date.parse(raw.ts))) return undefined
  const t: LiveTick = { v: 1, ts: raw.ts, ...(raw.heartbeat === true ? { heartbeat: true } : {}) }
  const list = (k: string, ok: (x: unknown) => boolean): unknown[] | undefined => Array.isArray(raw[k]) ? (raw[k] as unknown[]).filter(ok) : undefined
  const pools = list('pools', x => withKey('poolId')(x) && typeof (x as Record<string, unknown>).status === 'string')
  if (pools !== undefined) t.pools = pools as LiveTick['pools']
  if (isObj(raw.pledges)) t.pledges = Object.fromEntries(Object.entries(raw.pledges).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).filter(withKey('outpoint'))])) as LiveTick['pledges']
  const listings = list('listings', withKey('outpoint'))
  if (listings !== undefined) t.listings = listings as LiveTick['listings']
  const vaults = list('vaults', withKey('vaultId'))
  if (vaults !== undefined) t.vaults = vaults as LiveTick['vaults']
  if (isObj(raw.vaultCredits)) t.vaultCredits = Object.fromEntries(Object.entries(raw.vaultCredits).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).filter(withKey('tokenId'))])) as LiveTick['vaultCredits']
  const agents = list('agents', withKey('identity'))
  if (agents !== undefined) t.agents = agents as LiveTick['agents']
  const health = list('health', x => withKey('service')(x) && typeof (x as Record<string, unknown>).ok === 'boolean')
  if (health !== undefined) t.health = health as LiveTick['health']
  const events = list('events', x => isObj(x) && typeof x.id === 'string' && typeof x.ts === 'string' && typeof x.src === 'string' && typeof x.type === 'string' && 'data' in x)
  if (events !== undefined) t.events = events as LiveTick['events']
  return t
}

export function applyTick (bus: EventBus, store: AppStoreApi, tick: LiveTick): void {
  const ts = tick.ts
  const pools = tick.pools as unknown as ApiPool[] | undefined
  if (pools !== undefined) {
    const events = derivePoolDiff(store.getState().pools.byId, pools, ts)
    store.getState().hydratePools(pools, ts)
    for (const e of events) bus.publish(e)
  }
  for (const [poolId, list] of Object.entries((tick.pledges ?? {}) as unknown as Record<string, PledgeView[]>)) {
    for (const e of derivePledgeDiff(store.getState().pools.byId[poolId]?.pledges, list, poolId, ts)) bus.publish(e)
    store.getState().setPledges(poolId, list)
  }
  // pledge_added adds its credits to the pool, but the coordinator's count already includes them: restore it
  if (pools !== undefined && tick.pledges !== undefined) store.getState().hydratePools(pools, ts)
  const listings = tick.listings as unknown as Listing[] | undefined
  if (listings !== undefined) {
    for (const e of deriveListingDiff(store.getState().listings.byOutpoint, listings, ts)) bus.publish(e)
    store.getState().hydrateListings(listings)
  }
  if (tick.vaults !== undefined) store.getState().hydrateVaults(tick.vaults as unknown as VaultView[])
  for (const [vaultId, outputs] of Object.entries(tick.vaultCredits ?? {})) {
    const credits = summariseCredits(outputs)
    if (JSON.stringify(credits) !== JSON.stringify(store.getState().vaults.byId[vaultId]?.credits ?? [])) {
      bus.publish(makeEvent('overlay', 'vault_credits', { vaultId, credits }))
    }
  }
  if (tick.agents !== undefined) store.getState().hydrateAgents(tick.agents as unknown as AgentInfo[], ts)
  for (const row of tick.health ?? []) {
    const current = store.getState().health[row.service as ServiceName]
    if (current === undefined) continue // a service this web does not show (e.g. the relay itself)
    if (current.ok === row.ok && current.detail === row.detail) continue
    bus.publish(makeEvent('web', 'service_health', { service: row.service as ServiceName, ok: row.ok, ...(row.detail !== undefined ? { detail: row.detail } : {}) }))
  }
  for (const e of tick.events ?? []) bus.publish(e as CoopEvent)
}

/**
 * The tables at start, into the store without events: like the direct mode's first REST load, the Town and the
 * feed show the state as it is, not a burst of "pool opened" / "pledge" for everything that already happened.
 */
export function applySnapshot (store: AppStoreApi, snap: LiveSnapshot): void {
  const ts = new Date().toISOString()
  const s = store.getState()
  s.hydratePools(snap.pools, ts)
  for (const [poolId, list] of Object.entries(snap.pledges)) s.setPledges(poolId, list)
  s.hydrateListings(snap.listings)
  s.hydrateVaults(snap.vaults.map(v => ({ ...v, ...(snap.vaultCredits[v.vaultId] !== undefined ? { credits: summariseCredits(snap.vaultCredits[v.vaultId] ?? []) } : {}) })))
  s.hydrateAgents(snap.agents, ts)
  for (const h of snap.health) {
    if (s.health[h.service as ServiceName] === undefined) continue
    s.setHealth(h.service as ServiceName, { ok: h.ok, checkedAt: ts, ...(h.detail !== undefined ? { detail: h.detail } : {}) })
  }
}

/**
 * Earlier events into the store (feed, tx ledger, charts) without the bus: no Town effects, sounds, toasts or
 * unread notifications for the past. `bus` remembers their ids so a tick repeating one does not apply it twice.
 */
export function hydrateHistory (store: AppStoreApi, events: CoopEvent[], bus?: EventBus): void {
  const before = store.getState()
  for (const e of events) { store.getState().applyEvent(e); bus?.remember(e) }
  const after = store.getState()
  store.setState({ ui: { ...after.ui, toasts: before.ui.toasts }, notifications: before.notifications })
}
