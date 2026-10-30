/** One interface for every user action; live.ts talks to BSV Desktop + core, mock.ts to the mock world. */
import type { PledgeInstructions, SettlementPlan } from '@agentcoop/core'
import type { Catalog, GuardDecision, GuardPolicy, Listing, ProviderJob, VaultView } from '../../api/types'
import type { DataMode } from '../../env'

export type PledgeStatus = 'pending' | 'signed' | 'settled' | 'failed' | 'withdrawn' | 'left-out'

export interface MyPledge {
  poolId: string
  label: string
  txid: string
  outpoint: string
  credits: string
  coinSats: number
  tokenIndex: number
  instructions: PledgeInstructions
  status: PledgeStatus
  plan?: SettlementPlan
  settledTxid?: string
  createdAt: string
}

export interface SignRequestData { poolId: string, round: number, plan: SettlementPlan, yourInputIndex: number }

export interface SignCheck { label: string, ok: boolean | 'skipped', detail?: string, stamp?: string }

export interface SignReview {
  request: SignRequestData
  pledge: MyPledge
  myChangeSats: string
  participants: number
  checks: SignCheck[]
  ok: boolean
}

export interface CreditBalance { tokenId: string, sym?: string, overlay: bigint, basket: bigint, utxos: number }
export interface PrepaidBalance { product: string, tokenId: string, minutesPerCredit: number, prepaidMinutes: number, returnableCredits: number }

export interface PoolDraft { label: string, credits: number, priceSats: number, feeSats: number, minCredits: number, deadlineBlocks: number }

export interface RevenueSummary { outputs: number, satoshis: number }

/** A vault I (the owner) created from this browser; enough to withdraw later without the guard (never a key). */
export interface MyVault {
  vaultId: string
  agent: string
  guard: string
  lockingScriptHex: string
  record: { v: '1', vaultId: string, owner: string, agent: string, guard: string }
  createdAt: string
  fundedSats: number
  lastTxid?: string
}

export interface VaultStatus { vault?: VaultView, policy?: GuardPolicy, policyUpdatedAt?: string, decisions: GuardDecision[], spentLast7dSats?: number }


export interface FlowsApi {
  readonly mode: DataMode
  // participant
  pledge: (poolId: string, credits: number) => Promise<MyPledge>
  cancelPledge: (outpoint: string) => Promise<{ txid: string }>
  reviewSignRequest: (req: SignRequestData) => Promise<SignReview>
  sign: (review: SignReview) => Promise<void>
  reject: (req: SignRequestData, reason: string) => Promise<void>
  afterSettlement: (poolId: string, txid: string) => Promise<void>
  credits: () => Promise<CreditBalance[]>
  catalog: () => Promise<Catalog>
  prepaid: () => Promise<PrepaidBalance[]>
  redeem: (credits: number) => Promise<{ txid: string, prepaidMinutes: number }>
  runJob: (kind: string, minutes: number) => Promise<{ jobId: string }>
  job: (jobId: string) => Promise<ProviderJob>
  returnCredits: (credits: number) => Promise<{ txid: string, credits: number, prepaidMinutes: number }>
  // provider
  mint: (args: { sym: string, amt: bigint, dec: number }) => Promise<{ txid: string, tokenId: string }>
  openPool: (draft: PoolDraft) => Promise<{ poolId: string, txid: string }>
  cancelPool: (poolId: string) => Promise<{ txid: string }>
  revenue: () => Promise<RevenueSummary>
  syncRevenue: () => Promise<{ added: number }>
  sweepRevenue: () => Promise<{ txid: string, satoshis: number } | undefined>
  // owner (vault + guard)
  createVault: (agent: string) => Promise<MyVault>
  fundVault: (vaultId: string, satoshis: number) => Promise<{ txid: string }>
  putPolicy: (agent: string, policy: GuardPolicy) => Promise<void>
  vaultStatus: (vaultId: string) => Promise<VaultStatus>
  withdrawVault: (vaultId: string) => Promise<{ txid: string, satoshis: number }>
  // market
  listings: () => Promise<Listing[]>
  listCredits: (credits: number, askSats: number) => Promise<{ txid: string, outpoint: string }>
  cancelListing: (outpoint: string) => Promise<{ txid: string }>
  sweep: (outpoints: string[]) => Promise<{ txid: string, credits: string, satoshis: number }>
}

export class FlowError extends Error {
  constructor (readonly flow: string, message: string, readonly cause?: unknown) { super(message); this.name = 'FlowError' }
}
