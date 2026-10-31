/**
 * Shapes of what the services answer (MASTER §3.5 coordinator, §3.6 provider, §3.7 guard,
 * §3.8 overlay). Declared here (not imported from the other tracks' apps) so apps/web only
 * depends on @agentcoop/core; keep them in sync with the MASTER tables.
 */
import type { Listing, Offer, PoolTerms, SettlementPlan } from '@agentcoop/core'

export type { Listing, Offer, PoolTerms, SettlementPlan }

export type ChainPoolStatus = 'open' | 'settled' | 'cancelled'
export type ApiPoolStatus = ChainPoolStatus | 'failed' | 'locking'

export interface PoolView {
  poolId: string
  txid: string
  terms: PoolTerms
  status: ChainPoolStatus
  pledgedCredits: string
  pledgeCount: number
  target: string
  settledTxid?: string
  spendingTxid?: string
  createdHeight?: number
  invalidReason?: string
}

export interface PledgeView {
  outpoint: string
  txid: string
  vout: number
  poolId: string
  participant: string
  credits: string
  tokenIndex: string
  signer: 'p2pkh' | 'vault'
  coinSats: number
  height?: number
  spent: boolean
  spendingTxid?: string
  valid: boolean
  invalidReason?: string
}

export interface SettlementView { poolId: string, txid: string, pledgeListHash: string, inputs: string[] }

export interface VaultView {
  vaultId: string
  owner: string
  agent: string
  guard: string
  scriptHex: string
  verified: boolean
  balanceSats: number
  utxos: Array<{ outpoint: string, satoshis: number }>
}

export interface CoordinatorStatus {
  round: number
  signed: number
  total: number
  blacklist: Array<{ outpoint: string, reason: string }>
  lastRound?: { round: number, outcome: 'settled' | 'failed', missing: string[], txid?: string }
}

/** `GET /pools` item: overlay view + what only the coordinator knows. */
export interface ApiPool extends Omit<PoolView, 'status'> {
  status: ApiPoolStatus
  hasOffer: boolean
  height?: number
  heightUnknown?: true
  coordinator?: CoordinatorStatus
}

export interface CoopHealth { ok: boolean, overlay: boolean, height: number | null, engine: boolean }

export interface CoopMetrics {
  settlements?: number
  participants?: { total?: number, avg?: number, max?: number }
  custodiedSats?: number
  custodyCheck?: string
  [k: string]: unknown
}

// ── provider (§3.6) ──
export interface CatalogProduct { id: string, label: string, unit: string, retailSatsPerCredit: number, minutesPerCredit: number, tokenId: string | null }
export interface Catalog {
  provider: { name: string, server: string }
  products: CatalogProduct[]
  jobKinds: string[]
  maxJobMinutes: number
  credits: { maxRedeem: number, maxPending: number, redeemTo: string }
  pools: unknown[]
  poolsSource: string
}
export type JobStatus = 'queued' | 'running' | 'done' | 'failed'
export interface ProviderJob { id: string, owner: string, product: string, kind: string, minutes: number, status: JobStatus, log: string[], resultHash?: string, payment: unknown, createdAt?: string }

// ── guard (§3.7) ──
export interface GuardPolicy { allowProviders: string[], maxPerPoolSats: number, weeklyCapSats: number, maxFeeSats: number, hotWalletDailySats: number }
export interface GuardPolicyResponse { owner: string, agent: string, policy: GuardPolicy, updatedAt: string }
export interface GuardDecision {
  id: string
  ts: string
  agent: string
  vaultId?: string
  kind: string
  poolId?: string
  sats?: number
  outcome: 'approved' | 'denied'
  reason?: string
  txid?: string
}
export interface GuardHealth { ok: boolean, identityKey: string, network: string }

// ── agents (§3.10, requested from C) ──
export interface AgentInfo { name: string, profile: string, identity: string, mode: 'p2pkh' | 'vault', vaultId?: string }
