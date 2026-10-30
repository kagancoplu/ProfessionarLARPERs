/**
 * The CoopEvent envelope (MASTER §3.10) and every event type the web app understands.
 * Adapters wrap each source's native messages into this envelope; the reducers, the Town
 * and the replay player only ever see CoopEvents, so live, mock and replay share one path.
 */
import type { DataMode, ServiceName } from '../env'
import type { ApiPool, ApiPoolStatus, Listing, PledgeView, SettlementPlan, VaultView } from '../api/types'

export type EventSource = 'coordinator' | 'overlay' | 'provider' | 'agents' | 'guard' | 'maker' | 'web'

export interface CoopEvent<T extends string = string, D = unknown> {
  /** increasing inside its source ("coordinator:1042") or a ulid; equals the SSE `id:` */
  id: string
  /** ISO-8601 */
  ts: string
  src: EventSource
  type: T
  data: D
  txid?: string
  poolId?: string
  /** identity key, for filtering */
  agent?: string
}

export interface VaultCreditView { tokenId: string, sym?: string, amt: string, utxos: number }
export type AgentAction = 'pledge' | 'skip' | 'redeem' | 'retail' | 'list' | 'buy' | 'sign' | 'reject'

export interface CoopEventMap {
  // coordinator (WS, §3.5)
  pool_update: { poolId: string, pledgedCredits: string, status: ApiPoolStatus }
  sign_request: { poolId: string, round: number, plan: SettlementPlan, yourInputIndex: number }
  settled: { poolId: string, txid: string }
  round_failed: { poolId: string, round: number, missing: string[] }
  pool_failed: { poolId: string }
  hello_ack: { identity: string, poolIds: string[] }
  error: { error: string, poolId?: string }
  // overlay (SSE, raw)
  admitted: { txid: string }
  spent: { txid: string }
  // overlay, derived by the web (derive.ts) or produced directly by mock/replay
  pool_opened: { pool: ApiPool }
  pledge_added: { pledge: PledgeView, pledgedCredits?: string }
  pledge_cancelled: { pledge: PledgeView, txid: string }
  pool_settled: { poolId: string, txid: string, participants: number, feeSats?: number }
  pool_cancelled: { poolId: string, txid: string }
  listing_added: { listing: Listing }
  listing_filled: { listing: Listing, txid: string, buyer?: string }
  listing_cancelled: { listing: Listing, txid: string }
  vault_funded: { vault: VaultView, txid: string }
  vault_spent: { vault: VaultView, txid: string, by: 'owner' | 'agent' }
  // agents (§3.10, C)
  agent_started: { name: string, profile: string, identity: string, mode?: 'p2pkh' | 'vault', vaultId?: string }
  agent_thought: { text: string }
  agent_decision: { action: AgentAction, poolId?: string, credits?: string, sats?: number, reason: string }
  agent_job: { jobId: string, kind: string, minutes: number, status: 'queued' | 'running' | 'done' | 'failed' }
  agent_payment: { kind: '402' | 'pledge' | 'redeem' | 'sweep', txid: string, sats?: number }
  agent_injected: { text: string }
  // guard (§3.7, D)
  cosign_approved: { agent: string, /** absent for a lighthouse co-sign (no vault) */ vaultId?: string, kind: string, poolId?: string, sats: number, paidSats?: number, feeSats?: number, txid?: string }
  cosign_denied: { agent: string, vaultId?: string, kind: string, poolId?: string, sats?: number, reason: string }
  policy_updated: { agent: string, owner?: string }
  vault_registered: { vaultId: string, owner: string, agent: string }
  /** credits locked to a vault script (A-P5 creditLock): only agent + guard can move them, the owner can always take them out */
  vault_credits: { vaultId: string, credits: VaultCreditView[] }
  vault_paused: { agent: string }
  vault_resumed: { agent: string }
  // provider (optional, C)
  job_queued: { jobId: string, owner: string, kind: string, minutes: number }
  job_running: { jobId: string, owner: string, kind: string, minutes: number, progress?: number }
  job_done: { jobId: string, owner: string, kind: string, minutes: number, resultHash?: string }
  credits_redeemed: { agent: string, credits: string, txid: string }
  payment_received: { txid: string, sats: number, owner: string }
  // maker / Rail (D.P3)
  rail_quote: { dir: string, amount: string, quote: string }
  rail_locked_base: { txHash: string }
  rail_funded_bsv: { txid: string }
  rail_claimed: { txid: string, txHash: string }
  rail_refunded: { txid?: string, txHash?: string }
  // web-local
  wallet_connected: { identityKey: string, network: string }
  wallet_disconnected: Record<string, never>
  service_health: { service: ServiceName, ok: boolean, detail?: string }
  mode_changed: { mode: DataMode, replayName?: string }
  mint_done: { tokenId: string, txid: string, sym: string }
  flow_step: { flow: string, step: string, status: 'start' | 'ok' | 'error', ms?: number, detail?: string, txid?: string }
}

export type CoopEventType = keyof CoopEventMap
export type EventOf<T extends CoopEventType> = CoopEvent<T, CoopEventMap[T]>
export type AnyCoopEvent = { [K in CoopEventType]: EventOf<K> }[CoopEventType]

const counters = new Map<EventSource, number>()

/** Build an envelope with a per-source increasing id (`web:12`). `ts` defaults to now. */
export function makeEvent<T extends CoopEventType> (
  src: EventSource,
  type: T,
  data: CoopEventMap[T],
  extra: { id?: string, ts?: string, txid?: string, poolId?: string, agent?: string } = {}
): EventOf<T> {
  const n = (counters.get(src) ?? 0) + 1
  counters.set(src, n)
  const e: EventOf<T> = { id: extra.id ?? `${src}:${n}`, ts: extra.ts ?? new Date().toISOString(), src, type, data }
  if (extra.txid !== undefined) e.txid = extra.txid
  if (extra.poolId !== undefined) e.poolId = extra.poolId
  if (extra.agent !== undefined) e.agent = extra.agent
  return e
}

/** Minimal structural check for events read from SSE/replay files. */
export function isCoopEvent (x: unknown): x is AnyCoopEvent {
  if (typeof x !== 'object' || x === null) return false
  const e = x as Record<string, unknown>
  return typeof e.id === 'string' && typeof e.ts === 'string' && typeof e.src === 'string' && typeof e.type === 'string' && 'data' in e
}

/** Reset the id counters (tests). */
export function resetEventCounters (): void { counters.clear() }
