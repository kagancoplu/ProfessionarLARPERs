/**
 * What the coordinator needs from Track A's core (MASTER §3.4), injected so
 * the coordinator does not re-implement the protocol: `coreProtocol` below
 * maps it onto A's planSettlement(offer, pledges, chain),
 * assembleSettlement(plan, unlockingScripts) and broadcastEF(tx, arcadeUrl).
 */
import { UnlockingScript, type Transaction } from '@agentcoop/core/sdk'
import { assembleSettlement, broadcastEF, fetchChainPolicy, planSettlement, type Offer, type SettlementPlan } from '@agentcoop/core'
import type { PledgeView } from '../../../packages/overlay/src/views'
import { coreCandidate } from './candidates'

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

/**
 * Track A's protocol (@agentcoop/core): planSettlement, assembleSettlement,
 * broadcastEF. The default for `npm run coordinator`. Tests override
 * `broadcast` (mock chain) and `policy` (fixed height and fee rate).
 */
export function coreProtocol (opts: {
  arcadeUrl: string
  /** fixed chain policy instead of Arcade /health (tests) */
  policy?: () => Promise<{ height: number, satsPerKb: number }>
  broadcast?: (tx: Transaction) => Promise<string>
}): SettlementProtocol {
  let cached: { at: number, value: { height: number, satsPerKb: number } } | undefined
  const policy = opts.policy ?? (async () => {
    if (cached === undefined || Date.now() - cached.at > 60_000) {
      const p = await fetchChainPolicy(opts.arcadeUrl)
      cached = { at: Date.now(), value: { height: p.height, satsPerKb: p.satsPerKb } }
    }
    return cached.value
  })
  return {
    async planSettlement (req) {
      const { height, satsPerKb } = await policy()
      const pledges = req.pledges.map(({ view, sourceTx }) => coreCandidate(view, sourceTx))
      return planSettlement(req.offer, pledges, { height: req.height ?? height, satsPerKb, offerSourceTx: req.creditSourceTx }, { round: req.round, exclude: req.exclude })
    },
    assembleSettlement (plan, _offer, scripts) {
      // The template already carries the offer's unlocking script at input 0.
      return assembleSettlement(plan, Object.fromEntries([...scripts].map(([i, hex]) => [i, UnlockingScript.fromHex(hex)])))
    },
    broadcast: opts.broadcast ?? (async tx => await broadcastEF(tx, opts.arcadeUrl))
  }
}
