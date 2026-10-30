/**
 * Track C Faz 3.1: agents trade pool credits on the market (Track A's
 * listings and sweep, Track B's listing index), mock chain, real components.
 *
 *   seller  eval holds more than its 7-day need → lists a lot of 5 at pool price × 1.1
 *   buyer   finetune runs short for a job → buys the listing in ONE tx (lineage checked) instead of paying retail
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Listing } from '@agentcoop/core'
import { startMockStack, type DemoAgent, type MockStack } from '../apps/agents/src/demo/harness'

describe('market: surplus credits are listed and bought instead of retail', () => {
  let stack: MockStack
  let finetune: DemoAgent, evalAgent: DemoAgent, inference: DemoAgent
  const listings = async (): Promise<Listing[]> => await (await fetch(`${stack.coopUrl}/listings?tokenId=${stack.tokenId}`)).json()

  beforeAll(async () => {
    stack = await startMockStack({ quiet: true })
    await stack.openPool({ credits: 40, priceSats: 1000, deadline: '+144', feeSats: 100, minCredits: 5, label: 'H100 block · 40 GPU-hours' })
    ;[finetune, evalAgent, inference] = [await stack.agent('finetune'), await stack.agent('eval'), await stack.agent('inference')]
    for (const a of [finetune, evalAgent, inference]) await a.procurement.considerPools()
    await Promise.all([finetune, evalAgent, inference].map(async a => { await a.participant.until(() => a.participant.active?.status === 'settled', 90_000) }))
  })
  afterAll(async () => { await stack?.close() })

  it('lists nothing while the credits match the forecast', async () => {
    await evalAgent.procurement.considerListing()
    expect(await listings()).toEqual([])
  })

  it('lists a lot of 5 at the pool price × 1.1 once the agent holds more than it needs', async () => {
    evalAgent.agent.profile.history.dailyMinutes = new Array(14).fill(20) // the owner pauses the nightly suite: ~2.3 GPU-hours a week
    await evalAgent.procurement.considerListing()
    const [l] = await listings()
    expect(l).toMatchObject({ tokenId: stack.tokenId, credits: '5', askSats: '138', seller: await evalAgent.agent.identityKey() })
    expect(await evalAgent.agent.ownedCredits()).toBe(6n) // 5 of 11 moved to the listing key
    await evalAgent.procurement.considerListing()
    expect(await listings()).toHaveLength(1) // one listing at a time
  })

  it('a buyer short of credits sweeps the listing instead of paying retail, and runs the job on credits', async () => {
    for (const minutes of [480, 480]) await finetune.procurement.runJob({ kind: 'finetune', minutes }) // 17 → 1 credit
    expect(await finetune.agent.ownedCredits()).toBe(1n)
    const spent = finetune.agent.spentThisWeekSats()
    const job = await finetune.procurement.runJob({ kind: 'finetune', minutes: 360 }) // needs 6, holds 1 → buys 5
    expect(job.payment).toMatchObject({ method: 'credits', minutes: 360 })
    expect(finetune.agent.spentThisWeekSats() - spent).toBe(138 + 60) // ask + sweep fee estimate, vs 250 sat retail
    expect(await listings()).toEqual([])
    const log = readFileSync(join(stack.dataDir, 'agents', 'finetune', 'decisions.log'), 'utf8')
    expect(log).toMatch(/Market: bought 5 credits from 1 listing\(s\) for 198 sat vs 250 sat at retail \(saves 21%\), each traced to the token deploy/)
  })

  it('the seller notices the sale and lists its next lot', async () => {
    await evalAgent.procurement.considerListing()
    const log = readFileSync(join(stack.dataDir, 'agents', 'eval', 'decisions.log'), 'utf8')
    expect(log).toMatch(/Market: my listing .* sold/)
    expect((await listings()).map(l => [l.credits, l.askSats])).toEqual([['3', '83']])
  })

  it('never buys its own listing, and keeps paying retail when listings do not beat it', async () => {
    expect(await evalAgent.market.buy(3)).toBeUndefined() // only its own listing is for sale
    expect(await inference.market.buy(5)).toBeUndefined() // 3 listed < 5 needed
  })
})
