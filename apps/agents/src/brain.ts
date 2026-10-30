/**
 * The agent's purchasing decision for one open pool: pledge how many credits,
 * or skip. Two brains answer the same four questions (idea.md):
 *   1. Need:    will I use it? (7-day forecast minus what I already hold)
 *   2. Price:   is it cheaper than retail, after the registration fee?
 *   3. Timing:  does the pool close within my forecast horizon?
 *   4. Budget:  does it fit the owner's caps and allowed providers?
 *
 * `rulesBrain` answers them deterministically. The LLM brain (llmBrain.ts)
 * reasons over the same facts. Either way `enforcePolicy` runs last and is
 * code, not a prompt: a brain can never pledge more than the owner allows.
 */
import type { AgentProfile } from './profile'
import type { Forecast } from './forecast'

/** Blocks per day on BSV (~10 min blocks). */
export const BLOCKS_PER_DAY = 144
/** Settlement fee share plus the pledge transaction fee, estimated (sats). */
export const TX_FEE_ESTIMATE_SATS = 80
/** Smallest saving worth a pledge. */
export const MIN_SAVINGS_PCT = 10

export interface PoolOpportunity {
  poolId: string
  label: string
  provider: string
  tokenId: string
  /** Pool size N (credits). */
  credits: number
  pledgedCredits: number
  /** P, for the whole block. */
  priceSats: number
  feeSats: number
  minCredits: number
  deadlineHeight: number
  height: number
  retailSatsPerCredit: number
  minutesPerCredit: number
  unit: string
}

export interface DecisionContext {
  agent: string
  description: string
  forecast: Forecast
  pool: PoolOpportunity
  budget: AgentProfile['budget'] & { spentThisWeekSats: number }
  satsBalance: number
  /** Earlier decision lines, newest last (the LLM sees a few). */
  recentDecisions: string[]
}

export interface Decision {
  action: 'pledge' | 'skip'
  credits: number
  reason: string
  brain: string
}

export interface Brain {
  name: string
  decide: (ctx: DecisionContext) => Promise<Decision>
}

const sat = (n: number): string => Math.round(n).toLocaleString('en-US')

/** Sats a pledge of `credits` costs: its share of P + 1 sat credit output + registration fee + tx fees. */
export function poolCost (pool: PoolOpportunity, credits: number): number {
  return Math.ceil((credits * pool.priceSats) / pool.credits) + 1 + pool.feeSats + TX_FEE_ESTIMATE_SATS
}

export const retailCost = (pool: PoolOpportunity, credits: number): number => credits * pool.retailSatsPerCredit

export const remainingCredits = (pool: PoolOpportunity): number => Math.max(0, pool.credits - pool.pledgedCredits)

/** Readable facts for decisions.log, shared by both brains. */
export function describe (ctx: DecisionContext): string[] {
  const { pool, forecast: f, budget } = ctx
  const perCredit = pool.priceSats / pool.credits
  const blocksLeft = pool.deadlineHeight - pool.height
  const off = Math.round(100 * (1 - perCredit / pool.retailSatsPerCredit))
  const hours = (m: number): string => (pool.minutesPerCredit === 60 ? `${(m / 60).toFixed(1)} GPU-hours` : `${m} GPU-min`)
  return [
    `Pool found: "${pool.label}", ${pool.credits} ${pool.unit} credits at ${perCredit.toFixed(1)} sat (retail ${pool.retailSatsPerCredit}, ${off}% off · demo pricing), ` +
      `${pool.pledgedCredits}/${pool.credits} pledged, closes in ${blocksLeft} blocks (~${(blocksLeft / BLOCKS_PER_DAY * 24).toFixed(0)} h), fee ${pool.feeSats} sat.`,
    `My forecast: ~${hours(f.needMinutes)} over the next ${f.horizonDays} days (14-day mean ${f.dailyMeanMinutes} GPU-min/day ± ${f.dailyStdevMinutes}; p90 ${hours(f.highMinutes)}).`,
    `What I hold covers ${hours(f.coveredMinutes)} = ${f.daysCovered} days; ${f.creditsNeeded} credits missing.`,
    `Budget: spent ${sat(budget.spentThisWeekSats)} of ${sat(budget.weeklyBudgetSats)} sat this week, ${sat(budget.maxPerPoolSats)} per pool, wallet ${sat(ctx.satsBalance)} sat.`
  ]
}

const skip = (reason: string, brain: string): Decision => ({ action: 'skip', credits: 0, reason, brain })

/** How many credits to ask for: the need, capped by the pool's room; may round up to close the pool or meet its minimum. */
export function sizePledge (ctx: DecisionContext): { credits: number, note?: string } | { skip: string } {
  const { pool, forecast: f } = ctx
  const need = f.creditsNeeded
  const room = remainingCredits(pool)
  if (room < pool.minCredits) return { skip: `the pool has only ${room} credits left, below its minimum pledge of ${pool.minCredits}` }
  // Taking a little more than I need is fine when it completes the pool or meets its minimum: the spare credits can be resold (market, Faz 3).
  const slack = Math.max(2, Math.ceil(need * 0.25))
  let credits = Math.min(need, room)
  let note: string | undefined
  if (room > need && room - need <= slack) { credits = room; note = `taking ${room - need} spare credit(s) to close the pool` }
  if (credits < pool.minCredits) {
    if (pool.minCredits - need > slack) return { skip: `the pool's minimum pledge (${pool.minCredits}) is well above my need (${need})` }
    note = `rounding up to the pool's minimum of ${pool.minCredits}`
    credits = pool.minCredits
  }
  return { credits, note }
}

/** The four questions, deterministically. */
export const rulesBrain: Brain = {
  name: 'rules',
  async decide (ctx) {
    const { pool, forecast: f, budget } = ctx
    // 4a. allowed provider
    if (budget.allowProviders.length > 0 && !budget.allowProviders.includes(pool.provider)) return skip('the provider is not on my owner\'s allow-list', 'rules')
    // 3. timing
    const blocksLeft = pool.deadlineHeight - pool.height
    if (blocksLeft <= 0) return skip('the pool is already closed', 'rules')
    if (blocksLeft > f.horizonDays * BLOCKS_PER_DAY) return skip(`it closes in ~${Math.round(blocksLeft / BLOCKS_PER_DAY)} days, beyond my ${f.horizonDays}-day forecast`, 'rules')
    // 1. need
    if (f.creditsNeeded === 0) return skip(`I am covered for ${f.daysCovered} days already`, 'rules')
    const sized = sizePledge(ctx)
    if ('skip' in sized) return skip(sized.skip, 'rules')
    let credits = sized.credits
    // 4b. budget: shrink to the per-pool cap and the weekly budget left, if that still meets the pool's minimum
    const capSats = Math.min(budget.maxPerPoolSats, budget.weeklyBudgetSats - budget.spentThisWeekSats, ctx.satsBalance)
    while (credits >= pool.minCredits && poolCost(pool, credits) > capSats) credits--
    if (credits < pool.minCredits) return skip(`even the minimum pledge costs ${sat(poolCost(pool, pool.minCredits))} sat, over my cap of ${sat(capSats)} sat`, 'rules')
    // 2. price (spare credits are not counted as savings)
    const cost = poolCost(pool, credits)
    const retail = retailCost(pool, Math.min(credits, f.creditsNeeded))
    const savingsPct = Math.round(100 * (retail - cost) / retail)
    if (savingsPct < MIN_SAVINGS_PCT) {
      return skip(`${credits} credits cost ${sat(cost)} sat with the ${pool.feeSats} sat fee vs ${sat(retail)} sat at retail (${savingsPct}% saving, I want ≥ ${MIN_SAVINGS_PCT}%)`, 'rules')
    }
    const notes = [sized.note, credits < sized.credits ? `cut to ${credits} by my budget` : undefined].filter(Boolean).join('; ')
    return {
      action: 'pledge',
      credits,
      reason: `${credits} credits cost ${sat(cost)} sat vs ${sat(retail)} sat at retail (saves ${savingsPct}%), within budget and caps${notes !== '' ? `; ${notes}` : ''}`,
      brain: 'rules'
    }
  }
}

/**
 * The owner's policy, enforced in code after any brain. Returns the decision,
 * possibly downgraded to a skip, and why.
 */
export function enforcePolicy (ctx: DecisionContext, d: Decision): Decision {
  if (d.action === 'skip') return { ...d, credits: 0 }
  const { pool, budget } = ctx
  const veto = (why: string): Decision => ({ action: 'skip', credits: 0, reason: `policy override (${d.brain} wanted ${d.credits}): ${why}`, brain: d.brain })
  if (!Number.isSafeInteger(d.credits) || d.credits < 1) return veto('not a whole number of credits')
  if (budget.allowProviders.length > 0 && !budget.allowProviders.includes(pool.provider)) return veto('provider not allowed')
  if (pool.deadlineHeight <= pool.height) return veto('pool closed')
  if (d.credits < pool.minCredits || d.credits > pool.credits) return veto(`credits must be ${pool.minCredits}..${pool.credits}`)
  if (d.credits > remainingCredits(pool)) return veto(`only ${remainingCredits(pool)} credits left in the pool`)
  const cost = poolCost(pool, d.credits)
  if (cost > budget.maxPerPoolSats) return veto(`${sat(cost)} sat is over the ${sat(budget.maxPerPoolSats)} sat per-pool cap`)
  if (budget.spentThisWeekSats + cost > budget.weeklyBudgetSats) return veto(`${sat(cost)} sat would pass the weekly budget (${sat(budget.spentThisWeekSats)}/${sat(budget.weeklyBudgetSats)})`)
  if (cost > ctx.satsBalance) return veto(`${sat(cost)} sat is more than the wallet holds (${sat(ctx.satsBalance)})`)
  // Never buy more than twice the forecast need: leftovers are a loss, not an investment.
  const maxCredits = Math.max(pool.minCredits, ctx.forecast.creditsNeeded * 2)
  if (d.credits > maxCredits) return veto(`${d.credits} credits is more than twice my forecast need (${ctx.forecast.creditsNeeded})`)
  return d
}
