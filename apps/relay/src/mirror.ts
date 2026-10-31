/**
 * The relay's memory of what Supabase already holds. Setters take the services' latest snapshots and keep
 * only what changed (per-entity JSON fingerprint against the last successful flush); `flush` writes those
 * rows and publishes one tick. A failed write keeps everything pending, so the next flush retries it.
 */
import { TABLES, type CoopEnvelope, type HealthRow, type Json, type LiveTick, type VaultOutput } from './contract'
import type { Sink } from './sink'

type PoolInput = Json & { poolId: string, status: string, pledges?: Json[] }

const fp = (x: unknown): string => JSON.stringify(x)

export class Mirror {
  /** fingerprints of what the last successful flush wrote, `${kind}:${key}` → JSON */
  private readonly written = new Map<string, string>()
  private readonly pools = new Map<string, PoolInput>()
  private listings?: Array<Json & { outpoint: string }>
  private readonly vaults = new Map<string, Json>()
  private readonly credits = new Map<string, VaultOutput[]>()
  private readonly agents = new Map<string, Json>()
  private readonly health = new Map<string, HealthRow>()
  private events: Array<{ e: CoopEnvelope, live: boolean }> = []
  /** latest vault records, so a credits-only change can still write a complete row */
  private readonly vaultData = new Map<string, Json>()

  constructor (private readonly sink: Sink, private readonly now: () => Date = () => new Date()) {}

  /** Stage `value` under `key` if it differs from what was written; drop it if it changed back. */
  private stage<T> (pending: Map<string, T>, kind: string, key: string, value: T): void {
    if (this.written.get(`${kind}:${key}`) === fp(value)) pending.delete(key)
    else pending.set(key, value)
  }

  setPools (pools: PoolInput[]): void { for (const p of pools) this.stage(this.pools, 'pool', p.poolId, p) }

  setListings (listings: Array<Json & { outpoint: string }>): void {
    this.listings = this.written.get('listings:') === fp(listings) ? undefined : listings
  }

  setVaults (vaults: Array<Json & { vaultId: string, scriptHex: string }>): void {
    for (const v of vaults) { this.vaultData.set(v.vaultId, v); this.stage(this.vaults, 'vault', v.vaultId, v) }
  }

  setVaultCredits (vaultId: string, outputs: VaultOutput[]): void { this.stage(this.credits, 'credits', vaultId, outputs) }

  setAgents (agents: Array<Json & { identity: string }>): void { for (const a of agents) this.stage(this.agents, 'agent', a.identity, a) }

  setHealth (row: HealthRow): void { this.stage(this.health, 'health', row.service, row) }

  /** `live: false` stores the event for history only (the web gets it elsewhere, e.g. the coordinator's WS). */
  pushEvent (e: CoopEnvelope, opts: { live?: boolean } = {}): void { this.events.push({ e, live: opts.live !== false }) }

  private empty (): boolean {
    return this.pools.size === 0 && this.listings === undefined && this.vaults.size === 0 && this.credits.size === 0 &&
      this.agents.size === 0 && this.health.size === 0 && this.events.length === 0
  }

  /** Write what changed and publish one tick; `undefined` when nothing changed. Throws (keeping it all pending) if a write fails. */
  async flush (): Promise<LiveTick | undefined> {
    if (this.empty()) return undefined
    const pools = [...this.pools.values()]
    const listings = this.listings
    const vaults = new Map(this.vaults)
    const credits = new Map(this.credits)
    const agents = new Map(this.agents)
    const health = [...this.health.values()]
    const events = this.events.slice() // pushEvent may append while the writes are in flight

    const tick: LiveTick = { v: 1, ts: this.now().toISOString() }
    if (pools.length > 0) {
      const data = pools.map(({ pledges: _p, ...pool }) => pool)
      tick.pools = data
      tick.pledges = Object.fromEntries(pools.filter(p => p.pledges !== undefined).map(p => [p.poolId, p.pledges ?? []]))
      await this.sink.upsert(TABLES.pools, pools.map((p, i) => ({ pool_id: p.poolId, status: p.status, data: data[i] })))
      const pledgeRows = pools.flatMap(p => (p.pledges ?? []).map(pl => ({ outpoint: pl.outpoint, pool_id: p.poolId, data: pl })))
      if (pledgeRows.length > 0) await this.sink.upsert(TABLES.pledges, pledgeRows)
    }
    if (listings !== undefined) {
      tick.listings = listings
      if (listings.length > 0) await this.sink.upsert(TABLES.listings, listings.map(l => ({ outpoint: l.outpoint, data: l })))
      await this.sink.deleteListingsExcept(listings.map(l => l.outpoint))
    }
    if (vaults.size > 0) tick.vaults = [...vaults.values()]
    if (credits.size > 0) tick.vaultCredits = Object.fromEntries(credits)
    const vaultIds = new Set([...vaults.keys(), ...credits.keys()].filter(id => this.vaultData.has(id)))
    if (vaultIds.size > 0) {
      await this.sink.upsert(TABLES.vaults, [...vaultIds].map(id => ({
        vault_id: id,
        data: this.vaultData.get(id),
        credits: credits.get(id) ?? this.lastCredits(id) ?? null
      })))
    }
    if (agents.size > 0) {
      tick.agents = [...agents.values()]
      await this.sink.upsert(TABLES.agents, [...agents].map(([identity, a]) => ({ identity, data: a })))
    }
    if (health.length > 0) {
      tick.health = health
      await this.sink.upsert(TABLES.health, health.map(h => ({ service: h.service, ok: h.ok, detail: h.detail ?? null })))
    }
    if (events.length > 0) {
      await this.sink.insertEvents(events.map(x => x.e))
      const live = events.filter(x => x.live).map(x => x.e)
      if (live.length > 0) tick.events = live
    }
    await this.sink.publishTick(tick)

    // committed: remember what is now in Supabase, clear what was staged before this flush started
    for (const p of pools) { this.written.set(`pool:${p.poolId}`, fp(p)); if (this.pools.get(p.poolId) === p) this.pools.delete(p.poolId) }
    if (listings !== undefined) { this.written.set('listings:', fp(listings)); if (this.listings === listings) this.listings = undefined }
    for (const [id, v] of vaults) { this.written.set(`vault:${id}`, fp(v)); if (this.vaults.get(id) === v) this.vaults.delete(id) }
    for (const [id, c] of credits) { this.written.set(`credits:${id}`, fp(c)); if (this.credits.get(id) === c) this.credits.delete(id) }
    for (const [id, a] of agents) { this.written.set(`agent:${id}`, fp(a)); if (this.agents.get(id) === a) this.agents.delete(id) }
    for (const h of health) { this.written.set(`health:${h.service}`, fp(h)); if (this.health.get(h.service) === h) this.health.delete(h.service) }
    this.events = this.events.slice(events.length)
    return tick
  }

  private lastCredits (vaultId: string): VaultOutput[] | undefined {
    const w = this.written.get(`credits:${vaultId}`)
    return w === undefined ? undefined : JSON.parse(w) as VaultOutput[]
  }

  async heartbeat (): Promise<void> { await this.sink.publishTick({ v: 1, ts: this.now().toISOString(), heartbeat: true }) }
}
