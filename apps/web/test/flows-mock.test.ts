import { beforeEach, describe, expect, it } from 'vitest'
import { createBus } from '../src/events/bus'
import { MOCK_IDS } from '../src/mock/data'
import { MockScenario } from '../src/mock/scenario'
import { createMockWorld } from '../src/mock/state'
import { createMockWallet } from '../src/mock/wallet'
import { createAppStore, type AppStoreApi } from '../src/store'
import { DEFAULT_SETTINGS } from '../src/store/types'
import { createMockFlows } from '../src/wallet/flows/mock'
import type { FlowsApi, SignRequestData } from '../src/wallet/flows/types'
import { mine } from '../src/wallet/mine'

let store: AppStoreApi
let flows: FlowsApi
let world: ReturnType<typeof createMockWorld>
let scenario: MockScenario

beforeEach(() => {
  store = createAppStore('mock', undefined, { ...DEFAULT_SETTINGS })
  const bus = createBus(store)
  world = createMockWorld()
  const wallet = createMockWallet({ identityKey: MOCK_IDS.me, autoApprove: true, delayMs: 0 })
  flows = createMockFlows({ world, bus, store, getWallet: () => wallet })
  mine.getState().load(MOCK_IDS.me)
  store.getState().setMe({ status: 'connected', identityKey: MOCK_IDS.me, network: 'mainnet' })
  scenario = new MockScenario({ bus, world, loop: false })
  bus.subscribe(e => { if (e.type === 'settled') void flows.afterSettlement(e.data.poolId, e.data.txid) })
})

const lastSignRequest = (): SignRequestData => {
  const e = [...store.getState().feed].reverse().find(x => x.type === 'sign_request')
  if (e === undefined || e.type !== 'sign_request') throw new Error('no sign_request')
  return e.data
}

describe('mock flows (participant)', () => {
  it('pledge → sign request → review → sign → settled with me → credits → redeem → job → return', async () => {
    const steps = scenario.buildCycle(0, Date.parse('2026-10-30T18:00:00Z'))
    steps[0]!.run() // pool A opens
    const poolId = [...world.pools.keys()][0]!
    const my = await flows.pledge(poolId, 150)
    expect(my.status).toBe('pending')
    expect(my.txid.startsWith('mock_')).toBe(true)
    expect(store.getState().pools.byId[poolId]?.pledges?.some(p => p.participant === MOCK_IDS.me)).toBe(true)
    for (const s of steps.slice(1, 8)) s.run() // agents think and pledge, then lock-in
    const req = lastSignRequest()
    expect(req.poolId).toBe(poolId)
    expect(req.plan.participants.some(p => p.outpoint === my.outpoint)).toBe(true)
    expect(store.getState().notifications.some(n => n.kind === 'sign_request')).toBe(true)
    const review = await flows.reviewSignRequest(req)
    expect(review.ok).toBe(true)
    expect(review.checks.filter(c => c.ok === true).length).toBeGreaterThanOrEqual(3)
    await flows.sign(review)
    expect(mine.getState().pledges[0]?.status).toBe('signed')
    expect(store.getState().notifications.some(n => n.kind === 'sign_request')).toBe(false)
    // settlement step (the human signed, so no postponement)
    steps.find(s => s.label === 'settlement')!.run()
    await new Promise(r => setTimeout(r, 500))
    expect(mine.getState().pledges[0]?.status).toBe('settled')
    expect(store.getState().metrics.participants).toBe(4)
    expect((await flows.credits())[0]?.overlay).toBe(150n)
    const r = await flows.redeem(2)
    expect(r.prepaidMinutes).toBe(120)
    expect((await flows.credits())[0]?.overlay).toBe(148n)
    const job = await flows.runJob('eval', 45)
    expect((await flows.job(job.jobId)).status).toBe('queued')
    expect((await flows.prepaid())[0]?.prepaidMinutes).toBe(75)
    const back = await flows.returnCredits(1)
    expect(back.prepaidMinutes).toBe(15)
    expect((await flows.credits())[0]?.overlay).toBe(149n)
  })

  it('withdraw a pledge; reject a round; the settlement waits for the human and then leaves them out', async () => {
    const steps = scenario.buildCycle(0, Date.parse('2026-10-30T18:00:00Z'))
    steps[0]!.run()
    const poolId = [...world.pools.keys()][0]!
    const my = await flows.pledge(poolId, 60)
    await flows.cancelPledge(my.outpoint)
    expect(mine.getState().pledges[0]?.status).toBe('withdrawn')
    expect(store.getState().pools.byId[poolId]?.pledgedCredits).toBe('0')
    const again = await flows.pledge(poolId, 80)
    for (const s of steps.slice(1, 8)) s.run()
    const req = lastSignRequest()
    await flows.reject(req, 'I changed my mind')
    expect(store.getState().notifications.some(n => n.kind === 'sign_request')).toBe(false)
    steps.find(s => s.label === 'settlement')!.run()
    await new Promise(r => setTimeout(r, 300))
    expect(store.getState().pools.byId[poolId]?.status).toBe('settled')
    expect(mine.getState().pledges.find(p => p.outpoint === again.outpoint)?.status).toBe('left-out')
  })
})

describe('mock flows (provider)', () => {
  it('mint → open pool → pool on the board → cancel → revenue sync/sweep', async () => {
    await expect(flows.openPool({ label: 'x', credits: 10, priceSats: 100, feeSats: 1, minCredits: 1, deadlineBlocks: 5 })).rejects.toThrow(/Mint credits first/)
    const m = await flows.mint({ sym: 'GPUH', amt: 1000n, dec: 0 })
    expect(m.tokenId.endsWith('_0')).toBe(true)
    expect(store.getState().txs.some(t => t.kind === 'T1')).toBe(true)
    const p = await flows.openPool({ label: 'my pool', credits: 100, priceSats: 2500, feeSats: 100, minCredits: 10, deadlineBlocks: 30 })
    expect(store.getState().pools.byId[p.poolId]?.terms.provider).toBe(MOCK_IDS.me)
    expect(store.getState().txs.some(t => t.kind === 'T2')).toBe(true)
    await flows.cancelPool(p.poolId)
    expect(store.getState().pools.byId[p.poolId]?.status).toBe('cancelled')
    expect(await flows.sweepRevenue()).toBeUndefined()
  })
})

describe('mock flows (owner: vault + guard)', () => {
  it('create → fund (T9) → policy → status → withdraw, with events for the store and the Town', async () => {
    const eval_ = MOCK_IDS.agents.eval
    const v = await flows.createVault(eval_)
    expect(v.agent).toBe(eval_)
    expect(v.record.owner).toBe(MOCK_IDS.me)
    expect(mine.getState().vaults[0]?.vaultId).toBe(v.vaultId)
    expect(store.getState().vaults.byId[v.vaultId]?.agent).toBe(eval_)
    await expect(flows.createVault(eval_)).rejects.toThrow(/already has a vault/)
    const f = await flows.fundVault(v.vaultId, 20_000)
    expect(f.txid.startsWith('mock_')).toBe(true)
    expect(store.getState().vaults.byId[v.vaultId]?.balanceSats).toBe(20_000)
    expect(store.getState().txs.some(t => t.kind === 'T9')).toBe(true)
    await flows.putPolicy(eval_, { allowProviders: [MOCK_IDS.provider], maxPerPoolSats: 1_000, weeklyCapSats: 5_000, maxFeeSats: 100, hotWalletDailySats: 500 })
    const st = await flows.vaultStatus(v.vaultId)
    expect(st.policy?.maxPerPoolSats).toBe(1_000)
    expect(st.vault?.balanceSats).toBe(20_000)
    const w = await flows.withdrawVault(v.vaultId)
    expect(w.satoshis).toBe(20_000)
    expect(store.getState().vaults.byId[v.vaultId]?.balanceSats).toBe(0)
    await expect(flows.withdrawVault(v.vaultId)).rejects.toThrow(/empty/)
  })
  it('injectNow plays the refusal beat: denial recorded on the vault, metrics count it', async () => {
    scenario.injectNow()
    await new Promise(r => setTimeout(r, 2_800))
    const vault = Object.values(store.getState().vaults.byId).find(v => v.agent === MOCK_IDS.agents.finetune)
    expect(vault?.decisions.some(d => d.outcome === 'denied')).toBe(true)
    expect(store.getState().metrics.deniedByGuard).toBeGreaterThanOrEqual(1)
    expect(store.getState().agents.byIdentity[MOCK_IDS.agents.finetune]?.injected).toBeDefined()
  })
})

describe('mock flows (market)', () => {
  it('list → shows at the stall → cancel; sweep another agent\'s listing → credits arrive', async () => {
    world.me.credits = 120n
    const l = await flows.listCredits(50, 1_500)
    expect(store.getState().listings.byOutpoint[l.outpoint]?.seller).toBe(MOCK_IDS.me)
    expect(world.me.credits).toBe(70n)
    await expect(flows.sweep([l.outpoint])).rejects.toThrow(/own listing/)
    await flows.cancelListing(l.outpoint)
    expect(store.getState().listings.byOutpoint[l.outpoint]).toBeUndefined()
    expect(world.me.credits).toBe(120n)
    // the scenario's inference agent lists 100 credits at 3 000 sat
    const steps = scenario.buildCycle(0, Date.parse('2026-10-30T18:00:00Z'))
    steps.find(s => s.label === 'inference lists credits')!.run()
    const listing = Object.values(store.getState().listings.byOutpoint)[0]!
    const r = await flows.sweep([listing.outpoint])
    expect(r.credits).toBe('100')
    expect(r.satoshis).toBe(3_000)
    expect(world.me.credits).toBe(220n)
    expect(store.getState().listings.byOutpoint[listing.outpoint]).toBeUndefined()
    expect(store.getState().txs.some(t => t.kind === 'T8')).toBe(true)
  })
})
