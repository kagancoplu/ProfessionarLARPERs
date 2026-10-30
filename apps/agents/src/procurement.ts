/**
 * Procurement router (track C 2.2): how the agent gets the GPU its work needs,
 * cheapest first:
 *   (a) credits it already holds → redeem + run the job for free
 *   (b) market listings that cover the shortfall for less than retail (market.ts)
 *   (c) an open pool the brain says yes to → pledge for the coming week
 *   (d) otherwise retail (HTTP 402)
 *
 * Pools are about the coming week, not the job at hand: a pledge settles later,
 * so the job in front of the agent still runs on credits or at retail.
 */
import type { PoolTerms } from '@agentcoop/core'
import { CosignRejected } from '@agentcoop/core/signers/VaultSigner'
import type { Agent } from './agent'
import { describe, enforcePolicy, poolCost, type Brain, type Decision, type DecisionContext, type PoolOpportunity } from './brain'
import { forecastNeed } from './forecast'
import type { Market } from './market'
import type { PoolParticipant } from './participant'
import type { JobView } from './providerClient'
import type { JobNeed } from './workload'

/** A pool as the coordinator's side API serves it (GET /pools, MASTER §3.5). */
export interface ApiPool {
  poolId: string
  terms: PoolTerms
  status: string
  pledgedCredits: string
  target: string
  hasOffer: boolean
  height?: number
}

export interface ProcurementOptions {
  agent: Agent
  brain: Brain
  /** Pool side; without it the agent only uses credits and retail. */
  participant?: PoolParticipant
  /** Listings: buy cheaper than retail, sell credits beyond the need. */
  market?: Market
  coopApiUrl?: string
}

export class Procurement {
  /** poolId → pledged credits when last decided (decide again only when the pool moved). */
  private readonly decided = new Map<string, string>()
  /** pledge outpoint → the part of its cost that comes back if the pool does not settle with it. */
  private readonly refundable = new Map<string, number>()

  /** A pledge that did not settle cost only its fee: give the rest back to the weekly budget. */
  private settleBudget (): void {
    for (const p of this.opts.participant?.history ?? []) {
      const back = this.refundable.get(p.outpoint)
      if (back === undefined) continue
      if (p.status === 'settled') this.refundable.delete(p.outpoint)
      else if (p.status === 'failed' || p.status === 'left-out' || p.status === 'withdrawn') {
        this.opts.agent.recordSpend(-back)
        this.refundable.delete(p.outpoint)
      }
    }
  }

  constructor (readonly opts: ProcurementOptions) {}

  async openPools (): Promise<ApiPool[]> {
    if (this.opts.coopApiUrl === undefined) return []
    const res = await fetch(`${this.opts.coopApiUrl}/pools`)
    if (!res.ok) throw new Error(`coordinator answered ${res.status}`)
    const body = await res.json() as ApiPool[] | { pools: ApiPool[] }
    return Array.isArray(body) ? body : body.pools
  }

  /** (c) Look at the open pools for my product and maybe pledge. Returns the pledge, else the last skip decided, else undefined. */
  async considerPools (): Promise<Decision | undefined> {
    const { agent, participant, brain } = this.opts
    this.settleBudget()
    // Never pledge while off the coordinator's WS: an agent that cannot sign gets its coin blacklisted.
    if (participant === undefined || participant.busy || !participant.connected) return undefined
    const product = await agent.product()
    if (product.tokenId === null) return undefined
    const candidates = (await this.openPools())
      .filter(p => p.status === 'open' && p.hasOffer && p.terms.tokenId === product.tokenId && this.decided.get(p.poolId) !== p.pledgedCredits)
      .sort((a, b) => Number(a.terms.priceSats) / Number(a.terms.credits) - Number(b.terms.priceSats) / Number(b.terms.credits))
    let last: Decision | undefined
    for (const pool of candidates) {
      this.decided.set(pool.poolId, pool.pledgedCredits)
      const ctx = await this.context(pool)
      const decision = enforcePolicy(ctx, await brain.decide(ctx))
      agent.emit('agent_decision', { action: decision.action, poolId: pool.poolId, credits: decision.credits, sats: decision.action === 'pledge' ? poolCost(ctx.pool, decision.credits) : undefined, reason: decision.reason }, { poolId: pool.poolId })
      for (const line of describe(ctx)) agent.log.decision(line)
      agent.log.decision(decision.action === 'pledge'
        ? `Decision: PLEDGE ${decision.credits} credits. ${decision.reason}. (brain: ${decision.brain})`
        : `Decision: SKIP. ${decision.reason}. (brain: ${decision.brain})`)
      if (decision.action === 'pledge') {
        let pledge
        try {
          pledge = await participant.pledge(pool.terms, decision.credits)
        } catch (e) {
          if (!(e instanceof CosignRejected)) throw e
          agent.log.decision(`The guard refused my pledge: ${e.reason}. My owner's policy wins; nothing left the vault.`)
          agent.emit('agent_decision', { action: 'skip', poolId: pool.poolId, credits: decision.credits, reason: `guard refused: ${e.reason}` }, { poolId: pool.poolId })
          return { ...decision, action: 'skip', credits: 0, reason: `guard refused: ${e.reason}` }
        }
        agent.recordSpend(poolCost(ctx.pool, decision.credits))
        this.refundable.set(pledge.outpoint, Math.ceil((decision.credits * ctx.pool.priceSats) / ctx.pool.credits) + 1)
        return decision
      }
      last = decision
    }
    return last
  }

  private async context (pool: ApiPool): Promise<DecisionContext> {
    const { agent } = this.opts
    const product = await agent.product()
    const mpc = product.minutesPerCredit ?? 1
    const [prepaidMinutes, owned, satsBalance] = await Promise.all([agent.prepaidMinutes(), agent.ownedCredits(), agent.satsBalance()])
    const t = pool.terms
    const opportunity: PoolOpportunity = {
      poolId: pool.poolId,
      label: t.label,
      provider: t.provider,
      tokenId: t.tokenId,
      credits: Number(t.credits),
      pledgedCredits: Number(pool.pledgedCredits),
      priceSats: Number(t.priceSats),
      feeSats: Number(t.feeSats),
      minCredits: Number(t.minCredits),
      deadlineHeight: Number(t.deadlineHeight),
      height: pool.height ?? (await agent.wallet.getHeight({})).height,
      retailSatsPerCredit: product.retailSatsPerCredit,
      minutesPerCredit: mpc,
      unit: product.unit
    }
    return {
      agent: agent.profile.name,
      description: agent.profile.description,
      forecast: forecastNeed(agent.profile.history.dailyMinutes, { prepaidMinutes, ownedCredits: Number(owned), pledgedCredits: 0 }, mpc),
      pool: opportunity,
      budget: { ...agent.profile.budget, spentThisWeekSats: agent.spentThisWeekSats() },
      satsBalance,
      recentDecisions: agent.log.decisions.slice(-6)
    }
  }

  /** (a)/(b)/(d) for the job at hand; (c) only explains where a pledge stands. */
  async runJob (need: JobNeed): Promise<JobView> {
    const { agent, participant, market } = this.opts
    let marketNote = market === undefined ? 'off' : 'nothing cheaper than retail'
    if (market !== undefined) {
      // (b) The shortfall in whole credits, if the provider's redeem cap lets credits pay for this job at all.
      const product = await agent.product()
      const catalog = await agent.catalog()
      if (product.tokenId !== null) {
        const mpc = product.minutesPerCredit ?? 1
        const prepaid = await agent.prepaidMinutes()
        const missing = Math.ceil((need.minutes - prepaid) / mpc)
        const room = Math.min(catalog.credits.maxRedeem, Math.floor((catalog.credits.maxPending * mpc - prepaid) / mpc))
        const owned = missing > 0 ? Number(await agent.ownedCredits()) : 0
        if (missing > owned && missing <= room) {
          try {
            const bought = await market.buy(missing - owned)
            if (bought !== undefined) marketNote = `bought ${bought.credits}`
          } catch (e) {
            marketNote = `failed (${(e as Error).message})`
          }
        } else if (missing > room) marketNote = 'job too big for the redeem cap'
      }
    }
    const job = await agent.runJob(need)
    if (job.payment.method === 'sats') {
      const pool = participant?.busy === true ? `pledged ${participant.active!.credits} to "${participant.active!.label}", not settled yet` : 'no pledge waiting'
      agent.log.info(`Route: credits ✗ → market: ${marketNote} → pool: ${pool} → retail.`)
    }
    return job
  }

  /** Sell what the forecast says the agent will not use (priced off the last pool it bought in). */
  async considerListing (): Promise<void> {
    const { participant, market } = this.opts
    if (market === undefined) return
    const settled = participant?.history.filter(p => p.status === 'settled').at(-1)
    await market.considerListing(settled?.pricePerCredit)
  }

  /** One step of the agent's day: look at pools, then do the next piece of work. */
  async tick (need: JobNeed): Promise<JobView> {
    try {
      await this.considerPools()
    } catch (e) {
      this.opts.agent.log.info(`Pool check failed: ${(e as Error).message}`)
    }
    const job = await this.runJob(need)
    try {
      await this.considerListing()
    } catch (e) {
      this.opts.agent.log.info(`Listing failed: ${(e as Error).message}`)
    }
    return job
  }
}
