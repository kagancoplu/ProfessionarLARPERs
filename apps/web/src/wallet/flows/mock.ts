/**
 * Mock flows: the same FlowsApi against the mock world. Every signing step goes through the mock
 * Desktop's approval scroll (createAction / createSignature), txids are `mock_`, events are published
 * exactly like the live adapters would, so the Town, the store and the e2e tests see no difference.
 */
import type { WalletInterface } from '@bsv/sdk'
import type { Catalog, PledgeView, ProviderJob } from '../../api/types'
import type { EventBus } from '../../events/bus'
import { makeEvent } from '../../events/types'
import { makeMockPledge, makeMockPool, MOCK_IDS, MOCK_PRODUCT, mockTxid } from '../../mock/data'
import type { MockWorld } from '../../mock/state'
import type { AppStoreApi } from '../../store'
import { mine } from '../mine'
import { createStepper } from './steps'
import { FlowError, type FlowsApi, type MyPledge, type SignReview } from './types'

export interface MockFlowDeps { world: MockWorld, bus: EventBus, store: AppStoreApi, getWallet: () => WalletInterface | undefined }

const wait = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms))
/** the mock Desktop only reads amounts and descriptions; the script is a placeholder */
const out = (satoshis: number, outputDescription: string) => ({ lockingScript: '00', satoshis, outputDescription })

export function createMockFlows (deps: MockFlowDeps): FlowsApi {
  const { world, bus, store } = deps
  const wallet = (): WalletInterface => { const w = deps.getWallet(); if (w === undefined) throw new FlowError('wallet', 'Connect BSV Desktop first.'); return w }
  const me = (): string => { const id = store.getState().me.identityKey; if (id === undefined) throw new FlowError('wallet', 'Connect BSV Desktop first.'); return id }
  const ts = (): string => new Date().toISOString()

  return {
    mode: 'mock',

    async pledge (poolId, credits) {
      const s = createStepper(bus, 'pledge')
      const pool = world.pools.get(poolId)
      if (pool === undefined || pool.status !== 'open') throw new FlowError('pledge', 'That pool is not open.')
      if (credits < Number(pool.terms.minCredits) || credits > Number(pool.terms.credits)) throw new FlowError('pledge', `Credits must be between ${pool.terms.minCredits} and ${pool.terms.credits}.`)
      const unit = Number(pool.terms.priceSats) / Number(pool.terms.credits)
      const coinSats = Math.ceil(credits * unit) + 1 + 300
      const res = await s.step('Build the pledge in BSV Desktop (coin stays in your wallet)', 'BRC-100', () => wallet().createAction({
        description: 'AgentCoop: pledge to pool',
        outputs: [out(coinSats, 'AgentCoop pledge coin (your key)'), out(Number(pool.terms.feeSats), 'registration fee → provider'), out(0, 'OP_RETURN agentcoop pledge')]
      }), r => ({ txid: r.txid }))
      const p: PledgeView = { ...makeMockPledge(pool, me(), String(credits), world.height), txid: res.txid!, outpoint: `${res.txid}_0`, coinSats }
      const list = world.pledges.get(poolId) ?? []
      list.push(p)
      world.pledges.set(poolId, list)
      const next = { ...pool, pledgedCredits: String(BigInt(pool.pledgedCredits) + BigInt(credits)), pledgeCount: pool.pledgeCount + 1 }
      world.pools.set(poolId, next)
      await s.step('Submit to the overlay (tm_agentcoop)', 'overlay', async () => { await wait(150) })
      bus.publish(makeEvent('overlay', 'pledge_added', { pledge: p, pledgedCredits: next.pledgedCredits }, { poolId, txid: p.txid, agent: p.participant }))
      const my: MyPledge = { poolId, label: pool.terms.label, txid: p.txid, outpoint: p.outpoint, credits: String(credits), coinSats, tokenIndex: 0, instructions: { protocolID: [1, 'agentcoop pledge'], keyID: 'mock', counterparty: 'anyone', poolId }, status: 'pending', createdAt: ts() }
      mine.getState().upsertPledge(my)
      world.me.pledges.set(poolId, { outpoint: p.outpoint, credits, signed: false })
      return my
    },

    async cancelPledge (outpoint) {
      const s = createStepper(bus, 'cancelPledge')
      const my = mine.getState().pledges.find(p => p.outpoint === outpoint)
      if (my === undefined) throw new FlowError('cancelPledge', 'No such pledge.')
      const res = await s.step('Spend the pledge coin back to your wallet', 'BRC-100', () => wallet().createAction({ description: 'AgentCoop: withdraw pledge', outputs: [out(my.coinSats, 'pledge coin → your balance')] }), r => ({ txid: r.txid }))
      const list = world.pledges.get(my.poolId) ?? []
      const view = list.find(p => p.outpoint === outpoint)
      if (view !== undefined) { view.spent = true; view.spendingTxid = res.txid; view.valid = false }
      const pool = world.pools.get(my.poolId)
      if (pool !== undefined) world.pools.set(my.poolId, { ...pool, pledgedCredits: String(BigInt(pool.pledgedCredits) - BigInt(my.credits)) })
      if (view !== undefined) bus.publish(makeEvent('overlay', 'pledge_cancelled', { pledge: view, txid: res.txid! }, { poolId: my.poolId, txid: res.txid, agent: me() }))
      mine.getState().patchPledge(outpoint, { status: 'withdrawn' })
      world.me.pledges.delete(my.poolId)
      return { txid: res.txid! }
    },

    async reviewSignRequest (req) {
      const s = createStepper(bus, 'sign')
      const my = mine.getState().pledges.find(p => p.poolId === req.poolId && (p.status === 'pending' || p.status === 'signed'))
      if (my === undefined) throw new FlowError('sign', 'No active pledge of mine in this pool.')
      await s.step('Fetch the provider\'s signed offer', 'HTTP', () => wait(120))
      const mineInPlan = req.plan.participants.find(p => p.outpoint === my.outpoint)
      await s.step('Verify the whole settlement (DvP, pledge-list hash, provider lineage from the token deploy)', 'lineage', () => wait(400))
      const sum = req.plan.participants.reduce((a, p) => a + BigInt(p.credits), 0n)
      const checks: SignReview['checks'] = [
        { label: 'My pledge is in the plan', ok: mineInPlan !== undefined, stamp: 'AtomicBEEF' },
        { label: `My ${my.credits} credits go to my address #${my.tokenIndex}`, ok: mineInPlan?.credits === my.credits },
        { label: `My change (${mineInPlan?.changeSats ?? '0'} sat) comes back to my pledge key`, ok: mineInPlan !== undefined },
        { label: `Σ credits = N (${sum} = ${world.pools.get(req.poolId)?.terms.credits ?? '?'})`, ok: String(sum) === world.pools.get(req.poolId)?.terms.credits },
        { label: 'Pledge-list hash and the provider\'s credit lineage (mock: not verified on chain)', ok: 'skipped', stamp: 'SPV' }
      ]
      return { request: req, pledge: my, myChangeSats: mineInPlan?.changeSats ?? '0', participants: req.plan.participants.length, checks, ok: checks.every(c => c.ok !== false) }
    },

    async sign (review) {
      const s = createStepper(bus, 'sign')
      await s.step('Sign my input with SIGHASH_ALL in BSV Desktop', 'ALL', () => wallet().createSignature({ protocolID: [1, 'agentcoop pledge'], keyID: review.pledge.instructions.keyID, counterparty: 'anyone', data: [1] }))
      s.note('Signature sent to the coordinator', 'ALL', `round ${review.request.round}, input #${review.request.yourInputIndex}`)
      const m = world.me.pledges.get(review.request.poolId)
      if (m !== undefined) m.signed = true
      mine.getState().patchPledge(review.pledge.outpoint, { status: 'signed', plan: review.request.plan })
      store.getState().dismissNotification(`sign:${review.request.poolId}:${review.request.round}`)
      bus.publish(makeEvent('agents', 'agent_decision', { action: 'sign', poolId: review.request.poolId, reason: 'you verified the settlement and signed (mock Desktop)' }, { agent: me(), poolId: review.request.poolId }))
    },

    async reject (req, reason) {
      world.me.pledges.delete(req.poolId)
      store.getState().dismissNotification(`sign:${req.poolId}:${req.round}`)
      bus.publish(makeEvent('agents', 'agent_decision', { action: 'reject', poolId: req.poolId, reason }, { agent: me(), poolId: req.poolId }))
    },

    async afterSettlement (poolId, txid) {
      const my = mine.getState().pledges.find(p => p.poolId === poolId && (p.status === 'pending' || p.status === 'signed'))
      if (my === undefined) return
      const s = createStepper(bus, 'settled')
      if (my.status !== 'signed') { mine.getState().patchPledge(my.outpoint, { status: 'left-out', settledTxid: txid }); s.note('The pool settled without my pledge; my coin was not touched', 'ALL'); return }
      await s.step('Take my change back into the agentcoop basket', 'internalizeAction', () => wait(200))
      await s.step('Sync my credits (bsv21 basket)', 'BSV-21', () => wait(200), () => ({ detail: `${my.credits} credits received` }))
      world.me.credits += BigInt(my.credits)
      mine.getState().patchPledge(my.outpoint, { status: 'settled', settledTxid: txid })
      world.me.pledges.delete(poolId)
    },

    async credits () { return [{ tokenId: MOCK_PRODUCT.tokenId, sym: 'GPUH', overlay: world.me.credits, basket: world.me.credits, utxos: world.me.credits > 0n ? 1 : 0 }] },
    async catalog () { return { ...world.catalog, pools: [...world.pools.values()].filter(p => p.status === 'open') } as Catalog },
    async prepaid () { return [{ product: MOCK_PRODUCT.id, tokenId: MOCK_PRODUCT.tokenId, minutesPerCredit: 60, prepaidMinutes: world.me.prepaidMinutes, returnableCredits: Math.floor(world.me.prepaidMinutes / 60) }] },

    async redeem (credits) {
      const s = createStepper(bus, 'redeem')
      if (credits < 1 || credits > 20) throw new FlowError('redeem', 'Redeem between 1 and 20 credits (maxRedeem).')
      if (world.me.credits < BigInt(credits)) throw new FlowError('redeem', `You hold ${world.me.credits} credits.`)
      await s.step('Read the provider catalog (who to pay the credits to)', 'BRC-103', () => wait(100))
      const res = await s.step(`Send ${credits} credit(s) to the provider in BSV Desktop`, 'BSV-21', () => wallet().createAction({ description: 'AgentCoop: redeem credits', outputs: [out(1, `${credits} GPUH credits → provider`)] }), r => ({ txid: r.txid }))
      await s.step('Redeem at the provider (it verifies the lineage itself)', 'BRC-103', () => wait(250))
      world.me.credits -= BigInt(credits)
      world.me.prepaidMinutes += credits * 60
      bus.publish(makeEvent('provider', 'credits_redeemed', { agent: me(), credits: String(credits), txid: res.txid! }, { agent: me(), txid: res.txid }))
      return { txid: res.txid!, prepaidMinutes: world.me.prepaidMinutes }
    },

    async runJob (kind, minutes) {
      const s = createStepper(bus, 'job')
      const id = mockTxid('job').replace('mock_', 'mock_job_')
      const covered = world.me.prepaidMinutes >= minutes
      if (!covered) {
        const sats = Math.ceil(minutes * MOCK_PRODUCT.retailSatsPerCredit / 60)
        await s.step(`402: pay ${sats} sat retail in BSV Desktop (prepaid minutes do not cover ${minutes} min)`, 'BRC-105', () => wallet().createAction({ description: 'AgentCoop: 402 payment to provider', outputs: [out(sats, 'BRC-29 payment → provider-api')] }), r => ({ txid: r.txid }))
        bus.publish(makeEvent('agents', 'agent_payment', { kind: '402', txid: mockTxid('402'), sats }, { agent: me() }))
      } else {
        world.me.prepaidMinutes -= minutes
        s.note(`Paid with prepaid minutes (${minutes} min debited, ${world.me.prepaidMinutes} left)`, 'BRC-105')
      }
      const job: ProviderJob = { id, owner: me(), product: MOCK_PRODUCT.id, kind, minutes, status: 'queued', log: ['[mock] queued'], payment: covered ? { method: 'credits', minutes } : { method: 'sats' } }
      world.me.jobs.set(id, job)
      bus.publish(makeEvent('provider', 'job_queued', { jobId: id, owner: me(), kind, minutes }, { agent: me() }))
      setTimeout(() => { job.status = 'running'; job.log.push('[mock] 8×H100 allocated', `[mock] ${kind} batch 1/3`); bus.publish(makeEvent('provider', 'job_running', { jobId: id, owner: me(), kind, minutes, progress: 0.3 }, { agent: me() })) }, 1200)
      setTimeout(() => { job.status = 'done'; job.resultHash = `mock_result_${id.slice(-4)}`; job.log.push('[mock] batch 3/3', `[mock] done · result ${job.resultHash}`); bus.publish(makeEvent('provider', 'job_done', { jobId: id, owner: me(), kind, minutes, resultHash: job.resultHash }, { agent: me() })) }, 4200)
      return { jobId: id }
    },
    async job (jobId) { const j = world.me.jobs.get(jobId); if (j === undefined) throw new FlowError('job', 'no such job'); return { ...j, log: [...j.log] } },

    async returnCredits (credits) {
      const s = createStepper(bus, 'return')
      if (Math.floor(world.me.prepaidMinutes / 60) < credits) throw new FlowError('return', 'Not that many whole credits are returnable.')
      await s.step(`Ask the provider to return ${credits} unused credit(s)`, 'BRC-103', () => wait(300))
      world.me.prepaidMinutes -= credits * 60
      world.me.credits += BigInt(credits)
      const txid = mockTxid('return')
      bus.publish(makeEvent('provider', 'credits_redeemed', { agent: me(), credits: `-${credits}`, txid }, { agent: me(), txid }))
      return { txid, credits, prepaidMinutes: world.me.prepaidMinutes }
    },

    async mint (args) {
      const s = createStepper(bus, 'mint')
      const res = await s.step(`Deploy ${args.sym} (${args.amt} units) in BSV Desktop`, 'BSV-21', () => wallet().createAction({ description: `Deploy BSV-21 token ${args.sym}`, outputs: [out(1, `${args.sym} deploy+mint ${args.amt}`)] }), r => ({ txid: r.txid }))
      const tokenId = `${res.txid}_0`
      mine.getState().setTokenId(tokenId)
      world.me.minted = { sym: args.sym, amt: args.amt, tokenId }
      bus.publish(makeEvent('web', 'mint_done', { tokenId, txid: res.txid!, sym: args.sym }, { txid: res.txid, agent: me() }))
      return { txid: res.txid!, tokenId }
    },

    async openPool (draft) {
      const s = createStepper(bus, 'openPool')
      if (mine.getState().tokenId === undefined) throw new FlowError('openPool', 'Mint credits first (the pool sells your token).')
      const ann = await s.step('Reserve the credits and announce the pool in BSV Desktop (T2)', 'OP_RETURN', () => wallet().createAction({ description: 'AgentCoop: announce pool', outputs: [out(1, `${draft.credits} credits reserved (offer UTXO)`), out(0, 'OP_RETURN agentcoop pool')] }), r => ({ txid: r.txid }))
      await s.step('Sign the offer once: SIGHASH_SINGLE|ANYONECANPAY, then you can go offline', 'SINGLE|ACP', () => wallet().createSignature({ protocolID: [1, 'agentcoop provider'], keyID: 'offer mock', counterparty: 'anyone', data: [1] }))
      await s.step('Register the offer with the coordinator', 'HTTP', () => wait(120))
      const pool = { ...makeMockPool(world.pools.size + 1, world.height, { credits: String(draft.credits), priceSats: String(draft.priceSats), feeSats: String(draft.feeSats), minCredits: String(draft.minCredits), label: draft.label, deadlineHeight: String(world.height + draft.deadlineBlocks), provider: me(), tokenId: mine.getState().tokenId! }), txid: ann.txid!, poolId: `${ann.txid}_0` }
      pool.terms.poolId = pool.poolId
      world.pools.set(pool.poolId, pool)
      world.pledges.set(pool.poolId, [])
      world.me.pools.add(pool.poolId)
      mine.getState().addPool({ poolId: pool.poolId, nonce: 'mock', label: draft.label, txid: ann.txid!, createdAt: ts() })
      bus.publish(makeEvent('overlay', 'pool_opened', { pool }, { poolId: pool.poolId, txid: pool.txid, agent: me() }))
      return { poolId: pool.poolId, txid: ann.txid! }
    },

    async cancelPool (poolId) {
      const s = createStepper(bus, 'cancelPool')
      const pool = world.pools.get(poolId)
      if (pool === undefined) throw new FlowError('cancelPool', 'No such pool.')
      const res = await s.step('Spend the reserved credits back to your balance (the offer becomes void)', 'BRC-100', () => wallet().createAction({ description: 'AgentCoop: cancel pool', outputs: [out(1, 'credits back to your bsv21 basket')] }), r => ({ txid: r.txid }))
      world.pools.set(poolId, { ...pool, status: 'cancelled', spendingTxid: res.txid })
      bus.publish(makeEvent('overlay', 'pool_cancelled', { poolId, txid: res.txid! }, { poolId, txid: res.txid, agent: me() }))
      return { txid: res.txid! }
    },

    async revenue () { return { outputs: world.me.revenue.length, satoshis: world.me.revenue.reduce((a, r) => a + r, 0) } },
    async syncRevenue () {
      const s = createStepper(bus, 'syncRevenue')
      let added = 0
      for (const poolId of world.me.pools) {
        const pool = world.pools.get(poolId)
        const fees = (world.pledges.get(poolId) ?? []).length * Number(pool?.terms.feeSats ?? 0)
        const paid = pool?.status === 'settled' ? Number(pool.terms.priceSats) : 0
        const total = fees + paid - world.me.revenueSynced.reduce((a, r) => (r.poolId === poolId ? a + r.sats : a), 0)
        if (total > 0) { await s.step(`Track ${total} sat of revenue from ${pool?.terms.label ?? poolId}`, 'internalizeAction', () => wait(150)); world.me.revenue.push(total); world.me.revenueSynced.push({ poolId, sats: total }); added++ }
      }
      return { added }
    },
    async sweepRevenue () {
      const s = createStepper(bus, 'sweepRevenue')
      const total = world.me.revenue.reduce((a, r) => a + r, 0)
      if (total === 0) return undefined
      const res = await s.step(`Sweep ${world.me.revenue.length} revenue output(s), ${total} sat, into your balance`, 'BRC-100', () => wallet().createAction({ description: 'Sweep AgentCoop pool revenue', outputs: [out(total, 'revenue → your balance')] }), r => ({ txid: r.txid }))
      world.me.revenue = []
      return { txid: res.txid!, satoshis: total }
    }
  }
}

export const MOCK_ME = MOCK_IDS.me
