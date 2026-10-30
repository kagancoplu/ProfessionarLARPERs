/**
 * What the coordinator needs from Track A's core (MASTER §3.4), injected so
 * the coordinator does not re-implement the protocol. When @agentcoop/core
 * lands, an adapter maps these onto A's planSettlement(offer, pledges, chain),
 * assembleSettlement(plan, unlockingScripts) and broadcastEF(tx, arcadeUrl).
 */
import type { Transaction } from '@bsv/sdk'
import type { Offer, SettlementPlan } from '../../../packages/overlay/src/stub/types'
import type { PledgeView } from '../../../packages/overlay/src/views'

/** A valid, unspent pledge from the overlay, in coordinator order, with its source transaction (BEEF ancestry). */
export interface PledgeCandidate { view: PledgeView, sourceTx: Transaction }

export interface PlanRequest {
  offer: Offer
  /** the pool transaction (its out0 is the offer input) */
  creditSourceTx: Transaction
  pledges: PledgeCandidate[]
  round: number
  /** blacklisted pledge outpoints ("txid_vout"), already removed from `pledges` */
  exclude: string[]
  height?: number
}

export interface SettlementProtocol {
  /** Deterministic plan over `pledges` (MASTER §3.2 order); throws if they cannot fill the pool. */
  planSettlement: (req: PlanRequest) => Promise<SettlementPlan>
  /** The signed transaction: offer unlock at input 0, participant unlocks by input index. */
  assembleSettlement: (plan: SettlementPlan, offer: Offer, unlockingScripts: Map<number, string>) => Transaction
  /** Broadcast (Arcade, EF); resolves to the txid or throws. */
  broadcast: (tx: Transaction) => Promise<string>
}
