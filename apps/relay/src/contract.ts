/**
 * What the relay writes to Supabase and what the web reads back (plan/phases/SUPABASE-MVP.md).
 * Browser-safe: types and constants only. Rows carry the services' JSON as-is; only keys are typed.
 */
export type Json = Record<string, unknown>

/** MASTER §3.10 event envelope, as the services send it. */
export interface CoopEnvelope { id: string, ts: string, src: string, type: string, data: unknown, txid?: string, poolId?: string, agent?: string }

/** One credit output of a vault, as the overlay's `vaultCredits` lookup returns it. */
export interface VaultOutput { tokenId: string, amt: string, sym?: string, spent?: boolean }

/** `service` is one of the web's ServiceName values (coop, overlay, provider, guard, agents, arcade, maker). */
export interface HealthRow { service: string, ok: boolean, detail?: string }

/** One `live_ticks` row: only what changed since the previous tick. */
export interface LiveTick {
  v: 1
  ts: string
  heartbeat?: true
  /** changed pools, without their `pledges` */
  pools?: Json[]
  /** full pledge list of each changed pool */
  pledges?: Record<string, Json[]>
  /** the whole listing book, when it changed */
  listings?: Json[]
  vaults?: Json[]
  /** vaultId → its credit outputs */
  vaultCredits?: Record<string, VaultOutput[]>
  agents?: Json[]
  health?: HealthRow[]
  events?: CoopEnvelope[]
}

export const TABLES = {
  pools: 'live_pools',
  pledges: 'live_pledges',
  listings: 'live_listings',
  vaults: 'live_vaults',
  agents: 'live_agents',
  health: 'live_health',
  events: 'coop_events',
  ticks: 'live_ticks'
} as const
