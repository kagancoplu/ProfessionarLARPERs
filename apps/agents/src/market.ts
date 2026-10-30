/**
 * Market behaviour (track C 3.1, FINAL-IDEA §4.8), on Track A's builders and
 * Track B's listing index (`POST /listings`, `GET /listings?tokenId=`):
 *
 *   sell  credits beyond the agent's 7-day need are listed in small lots
 *         (a listing is one UTXO and sells whole) at the pool price × 1.1,
 *         always below retail: reserveListing → signListing (SINGLE|ACP) → POST
 *   buy   router step (b): when the job needs credits the agent does not hold,
 *         the cheapest listings that cover the shortfall are bought in ONE
 *         transaction (buildSweep; every listing traced to the deploy with
 *         verifyLineage first), if that costs less than retail
 */
import {
  beefFromArcade, buildSweep, reserveListing, signListing, type KitQuery, type LineageOptions, type Listing
} from '@agentcoop/core'
import type { Agent } from './agent'
import { forecastNeed } from './forecast'

export const LOT_SIZE = 5
export const MARKUP = 1.1
/** Fee estimate of a sweep transaction (sats). */
export const SWEEP_FEE_ESTIMATE_SATS = 60

export interface MarketOptions {
  coopApiUrl: string
  /** verifyLineage source (tests: the mock chain). Default: Arcade. */
  lineage?: LineageOptions
}

const sat = (n: number): string => Math.round(n).toLocaleString('en-US')

export class Market {
  /** My listing waiting for a buyer (one at a time). */
  private mine?: string

  constructor (private readonly agent: Agent, private readonly opts: MarketOptions) {}

  async listings (tokenId: string): Promise<Listing[]> {
    const res = await fetch(`${this.opts.coopApiUrl}/listings?tokenId=${encodeURIComponent(tokenId)}`)
    if (!res.ok) throw new Error(`coordinator answered ${res.status} for /listings`)
    return await res.json() as Listing[]
  }

  /** List credits beyond the 7-day need. `poolPricePerCredit`: what the agent paid; no pool price, no listing. */
  async considerListing (poolPricePerCredit: number | undefined): Promise<Listing | undefined> {
    const { agent } = this
    const product = await agent.product()
    if (product.tokenId === null || poolPricePerCredit === undefined) return undefined
    if (this.mine !== undefined) {
      if ((await this.listings(product.tokenId)).some(l => l.outpoint === this.mine)) return undefined // still for sale
      agent.log.decision(`Market: my listing ${this.mine.slice(0, 12)}… sold (or was cancelled).`)
      this.mine = undefined
    }
    const mpc = product.minutesPerCredit ?? 1
    const owned = Number(await agent.ownedCredits())
    const prepaid = await agent.prepaidMinutes()
    const f = forecastNeed(agent.profile.history.dailyMinutes, { prepaidMinutes: prepaid, ownedCredits: owned, pledgedCredits: 0 }, mpc)
    const surplus = Math.min(owned, Math.floor((f.coveredMinutes - f.needMinutes) / mpc))
    if (surplus < 1) return undefined
    const credits = Math.min(surplus, LOT_SIZE)
    const askSats = Math.ceil(credits * poolPricePerCredit * MARKUP)
    if (askSats >= credits * product.retailSatsPerCredit) return undefined // never ask retail or more
    const { outpoint } = await reserveListing(agent.wallet, agent.tokens!, product.tokenId, String(credits), String(askSats))
    const listing = await signListing(agent.wallet, outpoint, String(askSats))
    const res = await fetch(`${this.opts.coopApiUrl}/listings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(listing) })
    if (!res.ok) throw new Error(`coordinator refused the listing: ${res.status} ${await res.text()}`)
    this.mine = outpoint
    agent.log.decision(`Market: I hold ${surplus} credits beyond my ${f.horizonDays}-day need (${(f.needMinutes / mpc).toFixed(1)}). Listed ${credits} for ${sat(askSats)} sat ` +
      `(${(askSats / credits).toFixed(1)} sat/credit = pool price × ${MARKUP}, retail ${product.retailSatsPerCredit}), signed SINGLE|ANYONECANPAY: anyone who pays me gets them.`)
    return listing
  }

  /** Buy `credits` (or a little more) from the cheapest listings if that beats retail. Returns the sweep, if any. */
  async buy (credits: number): Promise<{ txid: string, credits: number, costSats: number } | undefined> {
    const { agent } = this
    const product = await agent.product()
    if (product.tokenId === null || credits < 1) return undefined
    const me = await agent.identityKey()
    const chosen: Listing[] = []
    let total = 0
    let cost = SWEEP_FEE_ESTIMATE_SATS
    for (const l of await this.listings(product.tokenId)) {
      if (total >= credits) break
      if (l.seller === me || Number(l.askSats) / Number(l.credits) >= product.retailSatsPerCredit) continue
      chosen.push(l)
      total += Number(l.credits)
      cost += Number(l.askSats)
    }
    if (total < credits) return undefined
    const retail = credits * product.retailSatsPerCredit
    const { budget } = agent.profile
    if (cost >= retail) {
      agent.log.decision(`Market: ${total} listed credits would cost ${sat(cost)} sat vs ${sat(retail)} sat at retail for the ${credits} I need: not buying.`)
      return undefined
    }
    if (cost > budget.maxPerPoolSats || agent.spentThisWeekSats() + cost > budget.weeklyBudgetSats) {
      agent.log.decision(`Market: buying ${total} credits for ${sat(cost)} sat would break my owner's caps: not buying.`)
      return undefined
    }
    // Listing BEEFs from the overlay (it keeps the ancestry), else Arcade.
    const overlay = agent.overlay!
    const getBeef = async (txid: string): Promise<number[]> => {
      const [o] = await overlay.lookup({ op: 'outpoint', txid, vout: 0 } satisfies KitQuery)
      return o !== undefined ? o.beef : await beefFromArcade(txid, this.opts.lineage?.arcadeUrl)
    }
    const res = await buildSweep(agent.wallet, agent.tokens!, chosen, { lineage: this.opts.lineage, getBeef })
    agent.recordSpend(cost)
    agent.log.decision(`Market: bought ${res.credits} credits from ${chosen.length} listing(s) for ${sat(cost)} sat vs ${sat(retail)} sat at retail (saves ${Math.round(100 * (retail - cost) / retail)}%), ` +
      `each traced to the token deploy before paying; one tx paid every seller. https://whatsonchain.com/tx/${res.txid}`)
    return { txid: res.txid, credits: Number(res.credits), costSats: cost }
  }
}
