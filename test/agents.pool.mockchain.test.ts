/**
 * Track C Faz 2, end to end on the mock chain with every real component
 * (Track A builders, Track B overlay and coordinator, provider API, agents):
 *
 *  K1      three agents forecast their week, decide with the rules brain,
 *          pledge, check and sign the coordinator's settlement, receive their
 *          credits in one transaction and spend them on their jobs.
 *  Failed  a pool that does not fill by its deadline costs the agent nothing
 *          but the fee; its pledge coin is reused for the next pool.
 *  Restart an agent restarted between its pledge and the round takes the
 *          pledge back from its wallet and signs (mainnet 31.10: it answered
 *          "no active pledge" and was blacklisted).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PLEDGE_BASKET } from '@agentcoop/core'
import { PoolParticipant } from '../apps/agents/src/participant'
import { startMockStack, type DemoAgent, type MockStack } from '../apps/agents/src/demo/harness'

describe('K1: three agents buy one GPU block together', () => {
  let stack: MockStack
  let agents: DemoAgent[]

  beforeAll(async () => { stack = await startMockStack({ quiet: true }) })
  afterAll(async () => { await stack?.close() })

  it('the provider opens a 40-credit pool; the agents forecast, decide and pledge 17 / 11 / 12', async () => {
    const pool = await stack.openPool({ credits: 40, priceSats: 1000, deadline: '+144', feeSats: 100, minCredits: 5, label: 'H100 block · 40 GPU-hours' })
    expect(pool.status).toBe('open')
    agents = []
    for (const name of ['finetune', 'eval', 'inference']) agents.push(await stack.agent(name))
    const decisions = []
    for (const a of agents) decisions.push(await a.procurement.considerPools())
    expect(decisions.map(d => [d?.action, d?.credits])).toEqual([['pledge', 17], ['pledge', 11], ['pledge', 12]])
    expect(decisions[2]?.reason).toMatch(/spare credit\(s\) to close the pool/)
  })

  it('the coordinator locks in; every agent verifies the plan, signs, and receives its credits in ONE settlement tx', async () => {
    await Promise.all(agents.map(async a => { await a.participant.until(() => a.participant.active?.status === 'settled', 90_000) }))
    const txids = new Set(agents.map(a => a.participant.active!.settledTxid))
    expect(txids.size).toBe(1)
    expect(await Promise.all(agents.map(async a => await a.agent.ownedCredits()))).toEqual([17n, 11n, 12n])
    const view = await (await fetch(`${stack.coopUrl}/pools/${agents[0].participant.active!.poolId}`)).json()
    expect(view).toMatchObject({ status: 'settled', pledgedCredits: '40' })
  })

  it('writes readable decisions to decisions.log', () => {
    const log = readFileSync(join(stack.dataDir, 'agents', 'finetune', 'decisions.log'), 'utf8')
    expect(log).toMatch(/Pool found: "H100 block · 40 GPU-hours", 40 GPU-hour credits at 25\.0 sat \(retail 50, 50% off · demo pricing\)/)
    expect(log).toMatch(/My forecast: ~16\.3 GPU-hours over the next 7 days/)
    expect(log).toMatch(/Decision: PLEDGE 17 credits\. 17 credits cost 606 sat vs 850 sat at retail \(saves 29%\)/)
    expect(log).toMatch(/Pool "H100 block · 40 GPU-hours" filled\. One settlement tx paid the provider/)
  })

  it('the agents spend their pool credits on their own work', async () => {
    const [finetune, , inference] = agents
    const big = await finetune.procurement.runJob({ kind: 'finetune', minutes: 300 })
    expect(big.payment).toMatchObject({ method: 'credits', minutes: 300 })
    expect(await finetune.agent.ownedCredits()).toBe(12n) // 5 credits redeemed for 5 GPU-hours
    const small = await inference.procurement.runJob({ kind: 'inference', minutes: 4 })
    expect(small.payment).toMatchObject({ method: 'credits', minutes: 4 })
    expect(await inference.agent.prepaidMinutes()).toBe(56)
  })

  it('does not pledge again once covered and the pool is settled', async () => {
    expect(await agents[0].procurement.considerPools()).toBeUndefined()
  })
})

describe('A pool that does not fill', () => {
  let stack: MockStack
  let a: DemoAgent

  beforeAll(async () => { stack = await startMockStack({ quiet: true }) })
  afterAll(async () => { await stack?.close() })

  it('fails at its deadline; nothing was spent and the pledge coin is still in the agent\'s wallet', async () => {
    await stack.openPool({ credits: 500, priceSats: 12_500, deadline: '+6', feeSats: 100, minCredits: 5, label: 'H100 rack · 500 GPU-hours' })
    a = await stack.agent('finetune')
    expect(await a.procurement.considerPools()).toMatchObject({ action: 'pledge', credits: 17 })
    const coin = a.participant.active!.outpoint
    await stack.advanceBlocks(7)
    await a.participant.until(() => a.participant.active?.status === 'failed', 30_000)
    const coins = (await a.wallet.listOutputs({ basket: PLEDGE_BASKET, limit: 100 })).outputs.filter(o => o.spendable)
    expect(coins.map(o => o.outpoint)).toEqual([coin.replace('_', '.')])
    expect(await a.agent.ownedCredits()).toBe(0n)
  })

  it('withdraws the coin and joins the next pool, which settles', async () => {
    await stack.openPool({ credits: 17, priceSats: 425, deadline: '+144', feeSats: 100, minCredits: 5, label: 'H100 block · 17 GPU-hours' })
    expect(await a.procurement.considerPools()).toMatchObject({ action: 'pledge', credits: 17 })
    expect(a.participant.history[0].status).toBe('withdrawn')
    await a.participant.until(() => a.participant.active?.status === 'settled', 90_000)
    expect(await a.agent.ownedCredits()).toBe(17n)
    // The failed pledge cost only its fee + tx fees (606 − 426 = 180 sat); the settled one 606 sat.
    expect(a.agent.spentThisWeekSats()).toBe(180 + 606)
    const log = readFileSync(join(stack.dataDir, 'agents', 'finetune', 'decisions.log'), 'utf8')
    expect(log).toMatch(/failed \(deadline passed before it filled\)\. Nothing was spent/)
    expect(log).toMatch(/Reusing my pledge coin: withdrew it from "H100 rack · 500 GPU-hours" \(that pool failed\)/)
  })
})

describe('An agent restarted between its pledge and the round', () => {
  let stack: MockStack
  afterAll(async () => { await stack?.close() })
  beforeAll(async () => { stack = await startMockStack({ quiet: true }) })

  it('restores its pledge from the wallet, signs, and the pool settles', async () => {
    await stack.openPool({ credits: 40, priceSats: 1000, deadline: '+144', feeSats: 100, minCredits: 5, label: 'restart' })
    const [finetune, evalAgent] = [await stack.agent('finetune'), await stack.agent('eval')]
    expect((await finetune.procurement.considerPools())?.action).toBe('pledge')
    expect((await evalAgent.procurement.considerPools())?.action).toBe('pledge')
    const pledged = evalAgent.participant.active!

    // "Restart" eval: the old process is gone; a fresh participant on the same wallet knows nothing until restore().
    evalAgent.participant.close()
    const restarted = new PoolParticipant({ wallet: evalAgent.wallet, kit: evalAgent.agent.tokens!, coopApiUrl: stack.coopUrl, log: evalAgent.agent.log, lineage: stack.lineage, reconnect: false })
    expect(restarted.active).toBeUndefined()
    const restored = await restarted.restore()
    expect(restored).toMatchObject({ poolId: pledged.poolId, outpoint: pledged.outpoint, credits: pledged.credits, tokenIndex: pledged.tokenIndex, status: 'pending', label: 'restart' })
    expect(restored!.instructions.keyID).toBe(pledged.instructions.keyID)
    await restarted.connect()

    const inference = await stack.agent('inference')
    expect((await inference.procurement.considerPools())?.action).toBe('pledge') // closes the pool: 17 + 11 + 12
    await Promise.all([finetune.participant, restarted, inference.participant].map(async p => { await p.until(() => p.active?.status === 'settled', 90_000) }))
    expect(restarted.active!.settledTxid).toBe(finetune.participant.active!.settledTxid)
    expect(await evalAgent.agent.ownedCredits()).toBe(11n)
    restarted.close()
  })
})
