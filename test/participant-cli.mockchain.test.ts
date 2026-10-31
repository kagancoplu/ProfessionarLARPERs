/**
 * Track C Faz 3.3: a human joins a pool with participant-cli (BSV Desktop in
 * production; a wallet-toolbox wallet here) next to two agents, signs when the
 * pool fills and receives credits from the same settlement; then withdraws a
 * pledge from another pool.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Wallet } from '@bsv/wallet-toolbox'
import { TokenKit } from '@agentcoop/core'
import type { ActivePledge } from '../apps/agents/src/participant'
import { cancel, pledge, pledgeLighthouse, pools, sign, sync, type ParticipantContext } from '../apps/participant-cli/src/commands'
import { startMockStack, type MockStack } from '../apps/agents/src/demo/harness'

describe('participant-cli: a human pledges next to the agents', () => {
  let stack: MockStack
  let human: Wallet
  let ctx: ParticipantContext
  const lines: string[] = []
  let poolId: string

  beforeAll(async () => {
    stack = await startMockStack({ quiet: true })
    human = await stack.chain.makeWallet()
    await stack.chain.fund(human)
    let saved: ActivePledge[] = []
    const pledges = { read: () => saved, write: (v: ActivePledge[]) => { saved = v } }
    ctx = { wallet: human, overlay: stack.overlayClient(), coopApiUrl: stack.coopUrl, pledges, out: l => { lines.push(l) }, lineage: stack.lineage }
  })
  afterAll(async () => { await stack?.close() })

  it('lists the open pools with their demo pricing', async () => {
    poolId = (await stack.openPool({ credits: 40, priceSats: 1000, deadline: '+144', feeSats: 100, minCredits: 5, label: 'H100 block · 40 GPU-hours' })).poolId!
    const open = await pools(ctx)
    expect(open.map(p => p.poolId)).toEqual([poolId])
    expect(lines.at(-1)).toMatch(/0\/40 pledged · 25\.0 sat\/credit \(retail 50, demo pricing\)/)
  })

  it('pledges, signs when the agents fill the pool, and gets its credits from the same settlement tx', async () => {
    const mine = await pledge(ctx, poolId, 12)
    expect(mine).toMatchObject({ poolId, credits: '12', status: 'pending' })
    const signing = sign(ctx, { timeoutMs: 90_000 }) // the human keeps `participant-cli sign` open
    const finetune = await stack.agent('finetune')
    const evalAgent = await stack.agent('eval')
    expect(await finetune.procurement.considerPools()).toMatchObject({ credits: 17 })
    expect(await evalAgent.procurement.considerPools()).toMatchObject({ credits: 11 }) // 12 + 17 + 11 = 40
    const done = await signing
    expect(done.status).toBe('settled')
    await finetune.participant.until(() => finetune.participant.active?.status === 'settled', 60_000)
    expect(done.settledTxid).toBe(finetune.participant.active!.settledTxid)
    const [b] = await new TokenKit(human, stack.overlayClient()).balances()
    expect(b).toMatchObject({ tokenId: stack.tokenId, overlay: 12n })
    expect(lines.some(l => /checked the whole settlement \(my 12 credits/.test(l))).toBe(true)
    expect(ctx.pledges.read()[0].status).toBe('settled')
  })

  it('withdraws a pledge; the coin returns and the overlay stops counting it', async () => {
    const other = (await stack.openPool({ credits: 30, priceSats: 750, deadline: '+144', feeSats: 100, minCredits: 5, label: 'H100 block · 30 GPU-hours' })).poolId!
    await pledge(ctx, other, 10)
    const progress = async (): Promise<string> => (await (await fetch(`${stack.coopUrl}/pools/${other}`)).json()).pledgedCredits
    expect(await progress()).toBe('10')
    await cancel(ctx)
    expect(await progress()).toBe('0')
    expect(ctx.pledges.read().at(-1)!.status).toBe('withdrawn')
  })
})

describe('participant-cli --lighthouse: sign now and leave (A-P5 5.5)', () => {
  let stack: MockStack
  let ctx: ParticipantContext
  const lines: string[] = []

  beforeAll(async () => {
    stack = await startMockStack({ quiet: true })
    const human = await stack.chain.makeWallet()
    await stack.chain.fund(human)
    let saved: ActivePledge[] = []
    ctx = { wallet: human, overlay: stack.overlayClient(), coopApiUrl: stack.coopUrl, pledges: { read: () => saved, write: v => { saved = v } }, out: l => { lines.push(l) }, lineage: stack.lineage }
  })
  afterAll(async () => { await stack?.close() })

  it('pledges once and goes offline; the guard co-signs the round; sync shows the credits', async () => {
    const poolId = (await stack.openPool({ credits: 40, priceSats: 1000, deadline: '+144', feeSats: 100, minCredits: 5, label: 'lighthouse block' })).poolId!
    const mine = await pledgeLighthouse(ctx, poolId, 12, { guardUrl: stack.guardUrl })
    expect(mine).toMatchObject({ poolId, credits: '12', status: 'pending', lighthouse: true })
    await expect(sign(ctx)).rejects.toThrow(/signed by its guard/) // nothing to keep open
    const pledges = await (await fetch(`${stack.coopUrl}/pools/${poolId}/pledges`)).json()
    expect(pledges.find((p: any) => p.outpoint === mine.outpoint)).toMatchObject({ mode: 'lighthouse', valid: true })

    const finetune = await stack.agent('finetune')
    const evalAgent = await stack.agent('eval')
    expect(await finetune.procurement.considerPools()).toMatchObject({ credits: 17 })
    expect(await evalAgent.procurement.considerPools()).toMatchObject({ credits: 11 }) // 12 + 17 + 11 = 40
    await finetune.participant.until(() => finetune.participant.active?.status === 'settled', 90_000)
    const balances = await sync(ctx)
    expect(balances).toEqual([expect.objectContaining({ tokenId: stack.tokenId, overlay: 12n })])
    expect(ctx.pledges.read()[0].status).toBe('settled')
  })

  it('withdraws a lighthouse pledge alone, without the guard', async () => {
    const other = (await stack.openPool({ credits: 30, priceSats: 750, deadline: '+144', feeSats: 100, minCredits: 5, label: 'second block' })).poolId!
    await pledgeLighthouse(ctx, other, 10, { guardUrl: stack.guardUrl })
    const progress = async (): Promise<string> => (await (await fetch(`${stack.coopUrl}/pools/${other}`)).json()).pledgedCredits
    expect(await progress()).toBe('10')
    await cancel(ctx)
    expect(await progress()).toBe('0')
    expect(ctx.pledges.read().at(-1)!.status).toBe('withdrawn')
  })
})
