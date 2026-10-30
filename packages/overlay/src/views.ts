/**
 * Shapes of the `context` JSON in ls_agentcoop answers (MASTER §3.8).
 * No runtime imports, so other packages (apps/coordinator, C's agents) can
 * import these types without pulling in a second copy of the SDK.
 */
import type { PoolTerms } from '@agentcoop/core'

/** What the chain says about a pool. `failed` and `locking` are derived by the coordinator API. */
export type PoolStatus = 'open' | 'settled' | 'cancelled'

export interface PoolView {
  poolId: string
  txid: string
  terms: PoolTerms
  status: PoolStatus
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
  /** A-P5 5.3: the credits settle onto the coin's vault script. */
  creditLock?: 'vault'
  /** A-P5 5.5: offline human; its guard co-signs at settlement. */
  mode?: 'lighthouse'
  guard?: string
  lhId?: string
  coinSats: number
  height?: number
  spent: boolean
  spendingTxid?: string
  valid: boolean
  invalidReason?: string
}

export interface SettlementView {
  poolId: string
  txid: string
  pledgeListHash: string
  inputs: string[]
}

export interface VaultView {
  vaultId: string
  owner: string
  agent: string
  guard: string
  scriptHex: string
  /** the script equals the one derived from owner/agent/guard for this vaultId (MASTER §3.8) */
  verified: boolean
  balanceSats: number
  utxos: Array<{ outpoint: string, satoshis: number }>
}
