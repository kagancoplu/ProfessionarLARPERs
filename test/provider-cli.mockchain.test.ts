/**
 * Track C Faz 1: provider operator CLI commands on the mock chain (BSV Desktop
 * in production; any BRC-100 wallet works, here wallet-toolbox).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Wallet } from '@bsv/wallet-toolbox'
import { anyonePkh, PROVIDER_PROTOCOL, REVENUE_BASKET, TokenKit } from '@agentcoop/core'
import { cancelPool, internalizeRevenue, listPools, mint, openPool, revenueLockingScript, sweepRevenue, type CliContext } from '../apps/provider-cli/src/commands'
import { PoolRegistry } from '../apps/provider-cli/src/pools'
import { createMockChain, type MockChain } from './helpers/mockchain'
import { startTestOverlay, type TestOverlay } from './helpers/overlay'
import { tempProductsDir } from './helpers/products'

let chain: MockChain
let overlay: TestOverlay
let operator: Wallet, payer: Wallet
let ctx: CliContext
let lines: string[]
let tokenId: string

const spendableSats = async (w: Wallet): Promise<number> =>
  (await w.listOutputs({ basket: 'default', limit: 1000 })).outputs.filter(o => o.spendable).reduce((s, o) => s + o.satoshis, 0)

beforeAll(async () => {
  chain = await createMockChain()
  overlay = await startTestOverlay(chain.chainTracker)
  ;[operator, payer] = await Promise.all([chain.makeWallet(), chain.makeWallet()])
  await chain.fund(operator)
  await chain.fund(payer)
  lines = []
  ctx = {
    wallet: operator, overlay: overlay.client(), coopApiUrl: 'http://localhost:1', providerApiUrl: 'https://provider.example',
    productsDir: tempProductsDir(), pools: new PoolRegistry(), out: l => { lines.push(l) }
  }
  ;({ tokenId } = await mint(ctx, { sym: 'GPUMIN', amt: 100_000n, dec: 0, product: 'gpu-h100' }))
})

afterAll(async () => {
  await overlay?.close()
  await chain?.close()
})

describe('open-pool', () => {
  it('reserves the credits, announces the pool and signs the offer (Track A builders); keeps the offer when the coordinator is down', async () => {
    const { height } = await operator.getHeight({})
    const rec = await openPool(ctx, { product: 'gpu-h100', credits: 1000, priceSats: 25_000, deadline: '+144', feeSats: 300, minCredits: 10, label: '8×H100 · 1 week' })
    expect(rec.status).toBe('announced')
    expect(rec.poolId).toBe(`${rec.announceTxid!}_0`)
    expect(rec.offer).toMatchObject({ poolId: rec.poolId, satoshis: 1, terms: { poolId: rec.poolId, payScriptHex: rec.terms.payScriptHex } })
    expect(rec.terms).toMatchObject({
      v: '1', provider: operator.identityKey, providerApi: 'https://provider.example', tokenId,
      credits: '1000', priceSats: '25000', feeSats: '300', minCredits: '10',
      deadlineHeight: String(height + 144), label: '8×H100 · 1 week', retailSatsPerCredit: '50'
    })
    // Output 0 and the pledge fees pay the operator's revenue key for this pool (MASTER §3.2).
    expect(rec.terms.payScriptHex).toBe(`76a914${anyonePkh(operator.identityKey, rec.nonce, PROVIDER_PROTOCOL)}88ac`)
    expect(lines.some(l => l.includes('25.0 sat/credit (retail 50, 50% off · demo pricing)'))).toBe(true)
    expect(lines.at(-1)).toMatch(/not registered: coordinator at http:\/\/localhost:1 is unreachable.*post-offer/)
    // The pool's credits left the operator's spendable token balance.
    const [b] = await new TokenKit(operator, overlay.client()).balances()
    expect(b.overlay).toBe(99_000n)
  })

  it('refuses a pool the operator cannot fill', async () => {
    await expect(openPool(ctx, { product: 'gpu-h100', credits: 200_000, priceSats: 1, deadline: '+10', feeSats: 0, minCredits: 1, label: 'too big' }))
      .rejects.toThrow(/you hold 99000 credits/)
  })
})

describe('revenue: Desktop-side pool income', () => {
  it('tracks payments to a pool revenue script and sweeps them into the wallet balance', async () => {
    const nonce = 'aa'.repeat(16)
    const payScriptHex = revenueLockingScript(operator.identityKey, nonce).toHex()
    // A pledge fee and a settlement payment, both to the pool's revenue script.
    const paid = await payer.createAction({
      description: 'Pool fee and settlement',
      outputs: [
        { lockingScript: payScriptHex, satoshis: 300, outputDescription: 'pledge fee' },
        { lockingScript: payScriptHex, satoshis: 5000, outputDescription: 'settlement' }
      ],
      options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
    })
    const added = await internalizeRevenue(ctx, Array.from(paid.tx!), paid.txid!, nonce, payScriptHex)
    expect(added).toEqual([`${paid.txid!}.0`, `${paid.txid!}.1`])
    expect(await internalizeRevenue(ctx, Array.from(paid.tx!), paid.txid!, nonce, payScriptHex)).toEqual([]) // idempotent

    const before = await spendableSats(operator)
    const swept = await sweepRevenue(ctx)
    expect(swept?.satoshis).toBe(5300)
    const gained = (await spendableSats(operator)) - before
    expect(gained).toBeGreaterThan(5000) // minus the sweep fee
    expect(gained).toBeLessThanOrEqual(5300)
    expect((await operator.listOutputs({ basket: REVENUE_BASKET, limit: 100 })).outputs.filter(o => o.spendable)).toHaveLength(0)
    expect(await sweepRevenue(ctx)).toBeUndefined()
  })
})

describe('cancel-pool', () => {
  it('spends the offer UTXO back to the operator (Track A cancelPool), voiding the offer', async () => {
    const pool = ctx.pools.all()[0]
    const poolId = pool.poolId!
    const res = await cancelPool(ctx, poolId)
    expect(ctx.pools.byPoolId(poolId)).toMatchObject({ status: 'cancelled', cancelTxid: res.txid })
    const [b] = await new TokenKit(operator, overlay.client()).balances()
    expect(b.overlay).toBe(100_000n) // the 1000 reserved credits are back
    await expect(cancelPool(ctx, poolId)).rejects.toThrow(/not in the 'agentcoop offers' basket/)
  })

  it('lists the local pools when the coordinator is down', async () => {
    lines.length = 0
    const rows = await listPools(ctx)
    expect(rows).toHaveLength(1)
    expect(lines[0]).toMatch(/unreachable/)
    expect(lines[1]).toMatch(/^cancelled/)
  })
})
