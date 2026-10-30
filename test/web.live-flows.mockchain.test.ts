/**
 * Track E: the browser's LIVE flows (apps/web/src/wallet/flows/live.ts) against the real stack on the mock chain:
 * overlay, coordinator, provider-api and guard in process (C's harness), a wallet-toolbox wallet standing in for
 * BSV Desktop. Until now these flows only ran with the mock Desktop; this is what they do against real services.
 *   1. a person pledges next to two agents, gets the coordinator's sign request over the WebSocket, reviews the
 *      whole settlement (verifySettlementPlan + lineage) and signs; the settlement delivers its credits
 *   2. it redeems a credit at the provider (AuthFetch) and runs a job on the prepaid minutes
 *   3. it lists some credits at the market; another person sweeps them (lineage checked, overlay BEEF)
 *   4. a provider mints and opens a pool (reserve + announce, SINGLE|ACP offer, on-chain offer record), then cancels
 *   5. an owner creates a vault for an agent at the guard (BRC-103), funds it, writes the policy, withdraws alone
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Wallet } from '@bsv/wallet-toolbox'
import { startMockStack, type MockStack } from '../apps/agents/src/demo/harness'
import { createBus } from '../apps/web/src/events/bus'
import { startCoordinatorFeed, type CoordinatorFeed } from '../apps/web/src/events/adapters/coordinatorWs'
import { resolveEnv, wsUrl, type AppEnv } from '../apps/web/src/env'
import { createAppStore, type AppStoreApi } from '../apps/web/src/store'
import { DEFAULT_SETTINGS } from '../apps/web/src/store/types'
import { createCoopApi } from '../apps/web/src/api/coop'
import { coordinatorHost, signHello } from '../apps/web/src/wallet/hello'
import { createLiveFlows } from '../apps/web/src/wallet/flows/live'
import type { FlowsApi, SignRequestData } from '../apps/web/src/wallet/flows/types'
import { mine } from '../apps/web/src/wallet/mine'

interface Person { wallet: Wallet, identity: string, store: AppStoreApi, flows: FlowsApi, feed?: CoordinatorFeed, close: () => void }

describe('web live flows on the mock chain (Track E)', () => {
  let stack: MockStack
  let env: AppEnv
  const people: Person[] = []

  const person = async (withFeed: boolean): Promise<Person> => {
    const wallet = await stack.chain.makeWallet()
    await stack.chain.fund(wallet)
    const { publicKey: identity } = await wallet.getPublicKey({ identityKey: true })
    const store = createAppStore('live', undefined, { ...DEFAULT_SETTINGS })
    const bus = createBus(store)
    store.getState().setMe({ status: 'connected', identityKey: identity, network: 'mainnet' })
    let feed: CoordinatorFeed | undefined
    if (withFeed) {
      const host = coordinatorHost(stack.coopUrl, { host: '' })
      feed = startCoordinatorFeed({ url: wsUrl(stack.coopUrl, { protocol: 'http:', host: '' }), bus, identity: () => identity, prove: async nonce => await signHello(wallet, host, nonce) })
    }
    const flows = createLiveFlows({ env, store, bus, getWallet: () => wallet, getFeed: () => feed, lineage: stack.lineage })
    const p: Person = { wallet, identity, store, flows, ...(feed !== undefined ? { feed } : {}), close: () => feed?.close() }
    people.push(p)
    return p
  }

  beforeAll(async () => {
    stack = await startMockStack({ quiet: true })
    env = { ...resolveEnv({}), urls: { coop: stack.coopUrl, overlay: stack.overlayUrl, provider: stack.apiUrl, guard: stack.guardUrl, agents: 'http://127.0.0.1:9', arcade: 'http://127.0.0.1:9', maker: 'http://127.0.0.1:9' }, network: 'test' }
  })
  afterAll(async () => { for (const p of people) p.close(); await stack?.close() })

  it('a person pledges, reviews and signs the round, and receives its credits from the settlement', async () => {
    const human = await person(true)
    mine.getState().load(human.identity)
    const poolId = (await stack.openPool({ credits: 40, priceSats: 1000, deadline: '+144', feeSats: 100, minCredits: 5, label: 'H100 · web live test' })).poolId!
    human.store.getState().hydratePools(await createCoopApi(stack.coopUrl).pools())
    const signed = new Promise<SignRequestData>((resolve, reject) => {
      const off = human.store.subscribe(s => {
        const req = [...s.feed].reverse().find(e => e.type === 'sign_request')
        if (req !== undefined && req.type === 'sign_request') { off(); resolve(req.data) }
      })
      setTimeout(() => reject(new Error('no sign_request within 60 s')), 60_000)
    })
    const my = await human.flows.pledge(poolId, 12)
    expect(my.status).toBe('pending')
    human.feed!.hello(human.identity, [poolId])
    const finetune = await stack.agent('finetune')
    const evalAgent = await stack.agent('eval')
    await finetune.procurement.considerPools()
    await evalAgent.procurement.considerPools()
    const req = await signed
    const review = await human.flows.reviewSignRequest(req)
    expect(review.checks.map(c => c.ok)).not.toContain(false)
    expect(review.ok).toBe(true)
    const settled = new Promise<string>((resolve, reject) => {
      const off = human.store.subscribe(s => { const e = [...s.feed].reverse().find(x => x.type === 'settled'); if (e !== undefined && e.type === 'settled') { off(); resolve(e.data.txid) } })
      setTimeout(() => reject(new Error('no settlement within 60 s')), 60_000)
    })
    await human.flows.sign(review)
    const txid = await settled
    await human.flows.afterSettlement(poolId, txid)
    expect(mine.getState().pledges.find(p => p.poolId === poolId)?.status).toBe('settled')
    const [credits] = await human.flows.credits()
    expect(credits).toMatchObject({ tokenId: stack.tokenId, overlay: 12n })
  })

  it('redeems a credit at the provider (AuthFetch, BRC-103) and runs a job paid with the prepaid minutes', async () => {
    const human = people[0]!
    mine.getState().load(human.identity)
    const r = await human.flows.redeem(1)
    expect(r.prepaidMinutes).toBeGreaterThanOrEqual(60)
    const [after] = await human.flows.credits()
    expect(after).toMatchObject({ overlay: 11n })
    const { jobId } = await human.flows.runJob('eval', 30)
    let job = await human.flows.job(jobId)
    for (let i = 0; i < 40 && job.status !== 'done'; i++) { await new Promise(res => setTimeout(res, 250)); job = await human.flows.job(jobId) }
    expect(job.status).toBe('done')
  })

  it('lists credits at the market and another person sweeps them (lineage checked)', async () => {
    const seller = people[0]!
    const listed = await seller.flows.listCredits(5, 200)
    const listings = await seller.flows.listings()
    expect(listings.map(l => l.outpoint)).toContain(listed.outpoint)
    const buyer = await person(false)
    mine.getState().load(buyer.identity)
    const r = await buyer.flows.sweep([listed.outpoint])
    expect(r).toMatchObject({ credits: '5', satoshis: 200 })
    const [b] = await buyer.flows.credits()
    expect(b).toMatchObject({ tokenId: stack.tokenId, overlay: 5n })
    expect((await seller.flows.listings()).map(l => l.outpoint)).not.toContain(listed.outpoint)
  })

  it('a provider mints credits and opens a pool from the browser; the coordinator and the overlay list it', async () => {
    const provider = await person(false)
    mine.getState().load(provider.identity)
    const { tokenId } = await provider.flows.mint({ sym: 'WEBT', amt: 1_000n, dec: 0 })
    expect(tokenId).toMatch(/^[0-9a-f]{64}_\d+$/)
    const { poolId } = await provider.flows.openPool({ label: 'web live pool', credits: 100, priceSats: 2_000, feeSats: 50, minCredits: 5, deadlineBlocks: 144 })
    const pools = await createCoopApi(stack.coopUrl).pools()
    expect(pools.find(p => p.poolId === poolId)).toMatchObject({ status: 'open', hasOffer: true })
    await provider.flows.cancelPool(poolId)
  })

  it('an owner creates a vault at the guard, funds it, writes the policy and withdraws alone', async () => {
    const owner = await person(false)
    mine.getState().load(owner.identity)
    const agent = { identity: people[1]!.identity }   // any third identity works as the agent's key
    const v = await owner.flows.createVault(agent.identity)
    expect(v.record.guard).toBe(stack.guard.identityKey)
    await owner.flows.fundVault(v.vaultId, 3_000)
    await owner.flows.putPolicy(agent.identity, { allowProviders: [], maxPerPoolSats: 1_000, weeklyCapSats: 2_000, maxFeeSats: 200, hotWalletDailySats: 0 })
    const status = await owner.flows.vaultStatus(v.vaultId)
    expect(status.policy?.maxPerPoolSats).toBe(1_000)
    const w = await owner.flows.withdrawVault(v.vaultId)
    expect(w.satoshis).toBe(3_000)
  })
})
