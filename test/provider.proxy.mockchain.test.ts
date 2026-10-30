/**
 * Track C Faz 3.4: a second product is configuration plus a runner. The same
 * provider-api process sells H100 GPU-hours (gpu runner) and residential-proxy
 * gigabytes (proxy runner, products/data-proxy.json), each with its own
 * credit token, retail price, credits and pools.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Wallet } from '@bsv/wallet-toolbox'
import { receivePkh, TokenKit } from '@agentcoop/core'
import { ProviderClient } from '../apps/agents/src/providerClient'
import { startMockStack, type MockStack } from '../apps/agents/src/demo/harness'

describe('second product: data-proxy (GB credits, proxy runner)', () => {
  let stack: MockStack
  let buyer: Wallet
  let client: ProviderClient
  let proxyToken: string

  beforeAll(async () => {
    stack = await startMockStack({ quiet: true, products: ['gpu-h100', 'data-proxy'] })
    proxyToken = stack.tokenIds['data-proxy']
    buyer = await stack.chain.makeWallet()
    await stack.chain.fund(buyer)
    client = new ProviderClient(buyer, stack.apiUrl)
  })
  afterAll(async () => { await stack?.close() })

  it('lists both products with their own token, unit, runner and job kinds', async () => {
    const { products } = await client.catalog()
    expect(products.map(p => p.id).sort()).toEqual(['data-proxy', 'gpu-h100'])
    expect(products.find(p => p.id === 'data-proxy')).toMatchObject({
      unit: 'GB', retailSatsPerCredit: 40, tokenId: proxyToken, demoPricing: true,
      runner: 'proxy', kinds: ['crawl', 'scrape'], quantityField: 'mb', unitsPerCredit: 1024
    })
    expect(products.find(p => p.id === 'data-proxy')).not.toHaveProperty('minutesPerCredit')
  })

  it('bills a proxy job per MB at the per-GB retail price (402) and runs it on the proxy runner', async () => {
    const res = await client.submitJob({ product: 'data-proxy', kind: 'crawl', mb: 2048 })
    expect(res.payment).toMatchObject({ method: 'sats', satoshis: 80 }) // 2 GB × 40 sat
    const job = await client.waitForJob(res.jobId)
    expect(job).toMatchObject({ kind: 'crawl', units: 2048, unit: 'mb' })
    expect(job).not.toHaveProperty('minutes')
    expect(job.log[0]).toMatch(/^\[exit-\d+\] crawl · 2,048 MB on Residential proxy GB/)
    expect(job.log.some(l => /MB · [\d,]+ req · \d+\.\d% ok · \d+ countries/.test(l))).toBe(true)
  })

  it('refuses GPU fields for a proxy product and proxy fields for the GPU product', async () => {
    await expect(client.submitJob({ product: 'data-proxy', kind: 'finetune', mb: 10 })).rejects.toThrow(/kind must be one of crawl, scrape/)
    await expect(client.submitJob({ product: 'data-proxy', kind: 'crawl', minutes: 10 })).rejects.toThrow(/mb must be an integer/)
    await expect(client.submitJob({ kind: 'crawl', mb: 10 })).rejects.toThrow(/finetune, eval, inference for gpu-h100/) // no product = GPU
  })

  it('redeems proxy credits as prepaid MB and spends them on a job', async () => {
    const kit = new TokenKit(buyer, stack.overlayClient())
    await new TokenKit(stack.operator.wallet, stack.overlayClient()).send(proxyToken, 5n, buyer.identityKey)
    await kit.sync()
    const server = (await client.catalog()).credits.redeemTo
    const { txid, recipientIndex } = await kit.send(proxyToken, 2n, server)
    const out = (await stack.overlayClient().lookup({ op: 'identity', identityKey: server, tokenId: proxyToken }))
      .find(o => o.txid === txid && o.ctx.ownerPkh === receivePkh(server, recipientIndex))!
    expect(await client.redeem(out.beef, out.vout)).toMatchObject({ credits: 2, prepaidUnits: 2048 })
    const res = await client.submitJob({ product: 'data-proxy', kind: 'scrape', mb: 1500 })
    expect(res.payment).toEqual({ method: 'credits', units: 1500, tokenId: proxyToken })
    const b = (await client.balance()).balances.find(x => x.product === 'data-proxy')
    expect(b).toMatchObject({ unit: 'mb', unitsPerCredit: 1024, prepaidUnits: 548, returnableCredits: 0 })
  })

  it('opens a proxy pool next to a GPU pool; the GPU agent only looks at its own product', async () => {
    const proxyPool = await stack.openPool({ product: 'data-proxy', credits: 100, priceSats: 2000, deadline: '+144', feeSats: 100, minCredits: 5, label: 'Proxy bandwidth · 100 GB' })
    const gpuPool = await stack.openPool({ credits: 40, priceSats: 1000, deadline: '+144', feeSats: 100, minCredits: 5, label: 'H100 block · 40 GPU-hours' })
    expect(proxyPool.terms).toMatchObject({ tokenId: proxyToken, retailSatsPerCredit: '40' })
    const { pools } = await client.catalog()
    expect((pools as Array<{ poolId: string }>).map(p => p.poolId).sort()).toEqual([proxyPool.poolId, gpuPool.poolId].sort())
    const finetune = await stack.agent('finetune')
    const d = await finetune.procurement.considerPools()
    expect(d).toMatchObject({ action: 'pledge', credits: 17 })
    expect(finetune.participant.active!.poolId).toBe(gpuPool.poolId)
  })
})
