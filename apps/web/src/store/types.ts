/** Store shape (track-E §3.1). One source of truth read by the consoles and the Town. */
import type { DataMode, ServiceName } from '../env'
import type { ApiPool, GuardDecision, GuardPolicy, Listing, PledgeView, VaultView } from '../api/types'
import type { AgentAction, AnyCoopEvent, EventSource, VaultCreditView } from '../events/types'

export type WalletStatus = 'idle' | 'connecting' | 'connected' | 'error'

export interface MeState {
  status: WalletStatus
  identityKey?: string
  network?: 'mainnet' | 'testnet'
  error?: string
  connectedAt?: string
}

export interface ServiceHealth { ok: boolean | 'unknown', checkedAt?: string, detail?: string }

export interface PoolEntry extends ApiPool {
  pledges?: PledgeView[]
  updatedAt: string
}

export interface AgentDecision { action: AgentAction, poolId?: string, credits?: string, sats?: number, reason: string, ts: string }

export interface AgentEntry {
  name: string
  profile: string
  identity: string
  mode?: 'p2pkh' | 'vault'
  vaultId?: string
  lastThought?: { text: string, ts: string }
  lastDecision?: AgentDecision
  decisions: AgentDecision[]
  injected?: { text: string, ts: string }
  /** sats the agent holds, when a source tells us (overlay-derived later) */
  purseSats?: number
  lastSeen: string
}

export interface VaultEntry extends VaultView {
  /** BSV-21 credits locked to this vault's script, per token */
  credits?: VaultCreditView[]
  policy?: GuardPolicy
  policyUpdatedAt?: string
  decisions: GuardDecision[]
  paused?: boolean
}

export interface JobEntry {
  jobId: string
  owner: string
  kind: string
  minutes: number
  status: 'queued' | 'running' | 'done' | 'failed'
  progress?: number
  resultHash?: string
  ts: string
}

/** FINAL-IDEA §7 catalogue. */
export type TxKind = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7' | 'T8' | 'T9' | 'T10' | 'T11'

export interface TxRecord {
  id: string
  kind: TxKind
  label: string
  txid: string
  ts: string
  actor?: string
  poolId?: string
  src: EventSource
}

export type NotificationKind = 'sign_request' | 'info' | 'error' | 'success'

export interface Notification {
  id: string
  kind: NotificationKind
  title: string
  body?: string
  ts: string
  expiresAt?: string
  poolId?: string
  read: boolean
}

export interface Metrics {
  settlements: number
  participants: number
  feeSats: number
  /** always 0 by construction (FINAL-IDEA §8); shown as "Held in custody" */
  custodiedSats: 0
  /** Σ (retail − pool price) over settled pools; labelled "demo pricing" */
  villageSavingsSats: number
  failedPools: number
  deniedByGuard: number
}

/** A point on the metrics charts. Kept apart from the 200-event feed so the charts cover the whole session. */
export type HistoryPoint =
  | { k: 'settled', ts: string, poolId: string, txid: string, savingsSats: number, participants: number }
  | { k: 'denied', ts: string, agent: string, reason: string }
  | { k: 'price', ts: string, satsPerCredit: number, credits: number, retail: number, filled: boolean }

export type PoolStepKind = 'opened' | 'pledge' | 'withdrawn' | 'locking' | 'signed' | 'round_failed' | 'settled' | 'failed' | 'cancelled'
/** One line of a pool's timeline (pool detail). */
export interface PoolStep { ts: string, step: PoolStepKind, text: string, txid?: string, actor?: string }

/** Per-agent tallies for the leaderboard. */
export interface AgentStats { poolsJoined: string[], creditsBought: number, savingsSats: number, settlements: number }

export interface History {
  points: HistoryPoint[]
  poolSteps: Record<string, PoolStep[]>
  agentStats: Record<string, AgentStats>
}

export const HISTORY_LIMIT = 600
export const POOL_STEP_LIMIT = 80

export interface Toast { id: string, kind: 'info' | 'success' | 'error' | 'warn', text: string, ts: string }

export type DrawerKind = 'pool' | 'agent' | 'tx' | 'vault' | 'listing' | 'me' | 'rail'

export interface UiState {
  drawer?: { kind: DrawerKind, id: string }
  toasts: Toast[]
  narrowScreen: boolean
}

export interface Settings {
  sound: boolean
  theme: 'day' | 'night' | 'auto'
  reducedMotion: boolean
  presenter: boolean
  replaySpeed: number
  /** walk the Town with your own villager (P6) */
  avatar: boolean
}

export interface StoreData {
  mode: DataMode
  replayName?: string
  me: MeState
  health: Record<ServiceName, ServiceHealth>
  pools: { byId: Record<string, PoolEntry>, order: string[] }
  listings: { byOutpoint: Record<string, Listing> }
  vaults: { byId: Record<string, VaultEntry> }
  agents: { byIdentity: Record<string, AgentEntry> }
  jobs: { byId: Record<string, JobEntry> }
  txs: TxRecord[]
  notifications: Notification[]
  metrics: Metrics
  history: History
  /** last FEED_LIMIT events, newest last */
  feed: AnyCoopEvent[]
  ui: UiState
  settings: Settings
  counters: { eventsSeen: number }
}

export const FEED_LIMIT = 200
export const TOAST_LIMIT = 5
export const SIGN_REQUEST_MS = 60_000

export const DEFAULT_SETTINGS: Settings = { sound: false, theme: 'auto', reducedMotion: false, presenter: false, replaySpeed: 1, avatar: false }

export function initialData (mode: DataMode = 'live', replayName?: string): StoreData {
  const health = (): ServiceHealth => ({ ok: 'unknown' })
  return {
    mode,
    ...(replayName !== undefined ? { replayName } : {}),
    me: { status: 'idle' },
    health: { coop: health(), overlay: health(), provider: health(), guard: health(), agents: health(), arcade: health(), maker: health() },
    pools: { byId: {}, order: [] },
    listings: { byOutpoint: {} },
    vaults: { byId: {} },
    agents: { byIdentity: {} },
    jobs: { byId: {} },
    txs: [],
    notifications: [],
    metrics: { settlements: 0, participants: 0, feeSats: 0, custodiedSats: 0, villageSavingsSats: 0, failedPools: 0, deniedByGuard: 0 },
    history: { points: [], poolSteps: {}, agentStats: {} },
    feed: [],
    ui: { toasts: [], narrowScreen: false },
    settings: { ...DEFAULT_SETTINGS },
    counters: { eventsSeen: 0 }
  }
}
