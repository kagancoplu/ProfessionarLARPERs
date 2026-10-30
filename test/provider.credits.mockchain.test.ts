/**
 * Track C Faz 1: credit tokens at the provider, end to end on the mock chain
 * with the real overlay over HTTP.
 *
 * The operator mints the credit token with `provider-cli mint` (BSV Desktop in
 * production, a wallet-toolbox wallet here) and sends credits to the agent,
 * standing in for a pool settlement. One credit is one GPU-hour, used by the
 * minute. The agent redeems credits, runs jobs on them, runs a job too big for
 * the cap at retail (402), and returns what it did not use. Redeems that break
 * the rules are refused.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import type { Wallet } from '@bsv/wallet-toolbox'
import { receivePkh, TokenKit, type OverlayClient } from '@agentcoop/core'
import { createProviderApp } from '../apps/provider-api/src/app'
import { CreditLedger } from '../apps/provider-api/src/credits'
import { JobRunner } from '../apps/provider-api/src/runner'
import { loadProducts, type Product } from '../apps/provider-api/src/products'
import { mint, type CliContext } from '../apps/provider-cli/src/commands'
import { PoolRegistry } from '../apps/provider-cli/src/pools'
import { Agent } from '../apps/agents/src/agent'
import { AgentLog } from '../apps/agents/src/log'
import { loadProfile } from '../apps/agents/src/profile'
import { ProviderClient, ProviderError } from '../apps/agents/src/providerClient'
import { createMockChain, type MockChain } from './helpers/mockchain'
import { startTestOverlay, type TestOverlay } from './helpers/overlay'
import { tempProductsDir } from './helpers/products'
import { listen, type Listening } from './helpers/http'

let chain: MockChain
let overlay: TestOverlay
let operator: Wallet, providerApi: Wallet, agentWallet: Wallet, stranger: Wallet
let products: Product[], tokenId: string, server: string
let runner: JobRunner
let ledgerFile: string
let api: Listening
let agent: Agent
let agentKit: TokenKit, strangerKit: TokenKit
let agentOverlay: OverlayClient

const spendableSats = async (w: Wallet): Promise<number> =>
  (await w.listOutputs({ basket: 'default', limit: 1000 })).outputs.filter(o => o.spendable).reduce((s, o) => s + o.satoshis, 0)

/** Send credits and return the redeem body for the output that pays `to`. */
async function transfer (kit: TokenKit, client: OverlayClient, token: string, amount: bigint, to: string): Promise<{ beef: number[], outputIndex: number, txid: string }> {
  await kit.sync()
  const { txid, recipientIndex } = await kit.send(token, amount, to)
  const pkh = receivePkh(to, recipientIndex)
  const out = (await client.lookup({ op: 'identity', identityKey: to, tokenId: token })).find(o => o.txid === txid && o.ctx.ownerPkh === pkh)!
  return { beef: out.beef, outputIndex: out.vout, txid }
}

const expectRefusal = async (p: Promise<unknown>, status: number, code: string): Promise<void> => {
  const err = await p.then(() => undefined, (e: unknown) => e)
  expect(err).toBeInstanceOf(ProviderError)
  expect(err).toMatchObject({ status, code })
}

beforeAll(async () => {
  chain = await createMockChain()
  overlay = await startTestOverlay(chain.chainTracker)
  ;[operator, providerApi, agentWallet, stranger] = await Promise.all([chain.makeWallet(), chain.makeWallet(), chain.makeWallet(), chain.makeWallet()])
  for (const w of [operator, providerApi, agentWallet, stranger]) await chain.fund(w)

  // The operator mints the credit token; the CLI writes its id into the product file.
  const productsDir = tempProductsDir()
  const ctx: CliContext = {
    wallet: operator, overlay: overlay.client(), coopApiUrl: 'http://localhost:1', providerApiUrl: 'http://provider.test',
    productsDir, pools: new PoolRegistry(), out: () => {}
  }
  ;({ tokenId } = await mint(ctx, { sym: 'GPUMIN', amt: 100_000n, dec: 0, product: 'gpu-h100' }))
  products = loadProducts(productsDir)

  // Stand-in for a settlement: the agent receives 100 credits.
  await new TokenKit(operator, overlay.client()).send(tokenId, 100n, agentWallet.identityKey)

  runner = new JobRunner({ products })
  ledgerFile = join(mkdtempSync(join(tmpdir(), 'agentcoop-ledger-')), 'balances.json')
  api = await listen(createProviderApp({ wallet: providerApi, products, runner, ledger: new CreditLedger(ledgerFile), overlay: overlay.client() }))
  server = providerApi.identityKey

  agentOverlay = overlay.client()
  agent = new Agent({ wallet: agentWallet, profile: loadProfile('eval'), providerUrl: api.url, overlay: agentOverlay, log: new AgentLog('eval', undefined, true) })
  agentKit = new TokenKit(agentWallet, agentOverlay)
  strangerKit = new TokenKit(stranger, overlay.client())
})

afterAll(async () => {
  runner?.stop()
  await api?.close()
  await overlay?.close()
  await chain?.close()
})

describe('provider-cli mint', () => {
  it('deployed the credit token and wrote it into the product configuration', async () => {
    expect(tokenId).toMatch(/^[0-9a-f]{64}_0$/)
    expect(products[0].tokenId).toBe(tokenId)
    const [b] = await new TokenKit(operator, overlay.client()).balances()
    expect(b).toMatchObject({ tokenId, sym: 'GPUMIN', overlay: 99_900n })
  })
})

describe('credits at the provider (one credit = one GPU-hour, used by the minute)', () => {
  it('advertises the credit token, its unit and where to redeem it', async () => {
    const catalog = await agent.catalog()
    expect(catalog.products[0]).toMatchObject({ tokenId, unit: 'GPU-hour', minutesPerCredit: 60, retailSatsPerCredit: 50 })
    expect(catalog.credits).toEqual({ maxRedeem: 20, maxPending: 20, redeemTo: server })
    expect(await agent.ownedCredits()).toBe(100n)
  })

  it('redeems one credit for a 45-minute job, which then costs no sats', async () => {
    const satsBefore = await spendableSats(providerApi)
    const job = await agent.runJob({ kind: 'eval', minutes: 45 })
    expect(job.payment).toEqual({ method: 'credits', minutes: 45, tokenId })
    expect(job.status).toBe('done')
    expect(await spendableSats(providerApi)).toBe(satsBefore)
    expect(await agent.prepaidMinutes()).toBe(15)
    expect(await agent.ownedCredits()).toBe(99n)
    // The redeemed credit is now the provider-api's token (overlay and basket agree).
    const [held] = await new TokenKit(providerApi, overlay.client()).balances()
    expect(held).toMatchObject({ tokenId, overlay: 1n, basket: 1n })
  })

  it('spends the leftover minutes on the next job without redeeming again', async () => {
    const job = await agent.runJob({ kind: 'eval', minutes: 15 })
    expect(job.payment).toEqual({ method: 'credits', minutes: 15, tokenId })
    expect(await agent.prepaidMinutes()).toBe(0)
    expect(await agent.ownedCredits()).toBe(99n)
  })

  it('pays an 8-hour fine-tune with 8 credits', async () => {
    const job = await agent.runJob({ kind: 'finetune', minutes: 480 })
    expect(job.payment).toEqual({ method: 'credits', minutes: 480, tokenId })
    expect(await agent.prepaidMinutes()).toBe(0)
    expect(await agent.ownedCredits()).toBe(91n)
  })

  it('pays retail (402, per minute) for a job bigger than the 20-credit cap', async () => {
    const satsBefore = await spendableSats(providerApi)
    const job = await agent.runJob({ kind: 'finetune', minutes: 1500 }) // 25 GPU-hours
    expect(job.payment).toMatchObject({ method: 'sats', satoshis: 1250 }) // 1500 × 50 / 60
    expect(await spendableSats(providerApi)).toBe(satsBefore + 1250)
    expect(await agent.ownedCredits()).toBe(91n)
  })

  it('refuses a redeem of more than 20 credits', async () => {
    const body = await transfer(agentKit, agentOverlay, tokenId, 21n, server)
    await expectRefusal(agent.provider.redeem(body.beef, body.outputIndex), 400, 'ERR_REDEEM_LIMIT')
    expect(await agent.prepaidMinutes()).toBe(0)
  })

  let redeemed: { beef: number[], outputIndex: number }
  it('redeems up to the cap, and refuses what would push the prepaid balance over 20 credits', async () => {
    redeemed = await transfer(agentKit, agentOverlay, tokenId, 12n, server)
    const res = await agent.provider.redeem(redeemed.beef, redeemed.outputIndex)
    expect(res).toMatchObject({ credits: 12, prepaidMinutes: 720, lineage: 'overlay' })
    const over = await transfer(agentKit, agentOverlay, tokenId, 9n, server)
    await expectRefusal(agent.provider.redeem(over.beef, over.outputIndex), 400, 'ERR_REDEEM_LIMIT')
    // The agent itself checks the cap before sending anything.
    await expect(agent.redeem(9)).rejects.toThrow(/cap/)
    expect(await agent.prepaidMinutes()).toBe(720)
  })

  it('refuses to redeem the same transfer twice (409)', async () => {
    await expectRefusal(agent.provider.redeem(redeemed.beef, redeemed.outputIndex), 409, 'ERR_REDEEM_REPLAYED')
    expect(await agent.prepaidMinutes()).toBe(720)
  })

  it('does not let a stranger claim a transfer it saw on the overlay', async () => {
    const body = await transfer(agentKit, agentOverlay, tokenId, 5n, server)
    const thief = new ProviderClient(stranger, api.url)
    await expectRefusal(thief.redeem(body.beef, body.outputIndex), 403, 'ERR_NOT_SENDER')
    expect((await agent.provider.redeem(body.beef, body.outputIndex)).prepaidMinutes).toBe(1020)
  })

  it('refuses another token, and credits not sent to the provider', async () => {
    const { tokenId: fake } = await strangerKit.deploy({ sym: 'FAKE', amt: 1000n, dec: 0 })
    const other = await transfer(strangerKit, overlay.client(), fake, 5n, server)
    await expectRefusal(new ProviderClient(stranger, api.url).redeem(other.beef, other.outputIndex), 400, 'ERR_WRONG_TOKEN')
    const notOurs = await transfer(agentKit, agentOverlay, tokenId, 3n, stranger.identityKey)
    await expectRefusal(agent.provider.redeem(notOurs.beef, notOurs.outputIndex), 400, 'ERR_NOT_OURS')
  })

  it("uses Track A's verifyLineage when it is available, and refuses what it rejects", async () => {
    const strict = await listen(createProviderApp({
      wallet: providerApi, products, runner, overlay: overlay.client(),
      verifyLineage: async () => ({ ok: false, tokenId, amt: '0', ownerPkh: '' })
    }))
    try {
      const body = await transfer(agentKit, agentOverlay, tokenId, 2n, server)
      await expectRefusal(new ProviderClient(agentWallet, strict.url).redeem(body.beef, body.outputIndex), 400, 'ERR_BAD_LINEAGE')
    } finally { await strict.close() }
  })

  it('returns unused whole credits as tokens', async () => {
    const owned = await agent.ownedCredits()
    const res = await agent.provider.returnCredits(7)
    expect(res).toMatchObject({ credits: 7, prepaidMinutes: 600 })
    expect(await agent.ownedCredits()).toBe(owned + 7n)
    await expectRefusal(agent.provider.returnCredits(11), 400, 'ERR_INSUFFICIENT_CREDITS')
  })

  it('keeps a part-credit remainder prepaid, and the balance survives a restart', async () => {
    await agent.runJob({ kind: 'eval', minutes: 40 })
    const [b] = (await agent.provider.balance()).balances
    expect(b).toMatchObject({ minutesPerCredit: 60, prepaidMinutes: 560, returnableCredits: 9 })
    expect((await agent.provider.returnCredits(9)).prepaidMinutes).toBe(20)
    await expectRefusal(agent.provider.returnCredits(1), 400, 'ERR_INSUFFICIENT_CREDITS')
    expect(new CreditLedger(ledgerFile).balance(agentWallet.identityKey, tokenId)).toBe(20)
  })
})
