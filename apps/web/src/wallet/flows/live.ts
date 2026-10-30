/**
 * Live flows: BSV Desktop (WalletClient) + @agentcoop/core builders + AuthFetch to the provider.
 * Every signature happens in the wallet; this file only assembles calls and records steps.
 */
import { AuthFetch, Random, Transaction, Utils, type WalletInterface } from '@agentcoop/core/sdk'
import {
  buildPledge, buildReserveAndAnnounce, buildSweep, cancelListing as coreCancelListing, cancelPledge, cancelPool as coreCancelPool, COOP_SERVICE, COOP_TOPIC, derivedP2pkhHex, internalizeSettlement, OverlayClient,
  P2PKH_UNLOCKING_SCRIPT_LENGTH, P2pkhWalletSigner, PROVIDER_PROTOCOL, publishOffer, receivePkh, reserveListing, REVENUE_BASKET, signListing, signOffer, signSettlementInput, signWalletP2pkhInput,
  TokenKit, verifySettlementPlan, type CustomInstructions, type KitQuery, type Offer, type PoolTerms, type TermsDraft
} from '@agentcoop/core'
import { beefFromArcade } from '@agentcoop/core/kit/overlayApi'
import type { VaultUtxo } from '@agentcoop/core/signers/VaultSigner'
import { guardApi } from '../../api/guard'
import { makeEvent } from '../../events/types'
import { createVault as opCreateVault, fundVault as opFundVault, ownerBasketUtxos, registerVault, withdrawVault as opWithdrawVault } from './vaultOps'
import { coopApi } from '../../api/coop'
import type { Catalog, GuardDecision, GuardPolicyResponse, ProviderJob, VaultView } from '../../api/types'
import type { AppEnv } from '../../env'
import type { EventBus } from '../../events/bus'
import type { CoordinatorFeed } from '../../events/adapters/coordinatorWs'
import type { AppStoreApi } from '../../store'
import { mine } from '../mine'
import { STEP } from './labels'
import { createStepper } from './steps'
import { FlowError, type CreditBalance, type FlowsApi, type MyPledge, type PrepaidBalance, type SignReview } from './types'

export interface LiveFlowDeps {
  env: AppEnv
  store: AppStoreApi
  bus: EventBus
  getWallet: () => WalletInterface | undefined
  getFeed: () => CoordinatorFeed | undefined
}

export function createLiveFlows (deps: LiveFlowDeps): FlowsApi {
  const { env, store, bus } = deps
  const wallet = (): WalletInterface => { const w = deps.getWallet(); if (w === undefined) throw new FlowError('wallet', 'Connect BSV Desktop first.'); return w }
  const overlay = (): OverlayClient => new OverlayClient(env.urls.overlay, undefined, env.network, env.urls.arcade, COOP_TOPIC, COOP_SERVICE)
  const kit = (): TokenKit => new TokenKit(wallet(), overlay())
  const auth = (): AuthFetch => new AuthFetch(wallet())
  const authJson = async <T>(path: string, body?: unknown): Promise<T> => {
    const res = await auth().fetch(`${env.urls.provider}${path}`, body === undefined ? { method: 'GET' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const text = await res.text()
    let json: unknown
    try { json = JSON.parse(text) } catch { json = text }
    if (!res.ok) throw new FlowError('provider', `provider answered ${res.status}: ${typeof json === 'object' && json !== null && 'description' in json ? String((json as { description: unknown }).description) : text.slice(0, 200)}`)
    return json as T
  }
  const identity = (): string => { const id = store.getState().me.identityKey; if (id === undefined) throw new FlowError('wallet', 'Connect BSV Desktop first.'); return id }
  const pool = (poolId: string): PoolTerms => { const p = store.getState().pools.byId[poolId]; if (p === undefined) throw new FlowError('pledge', 'That pool is not on the overlay.'); return p.terms }

  return {
    mode: 'live',

    async pledge (poolId, credits) {
      const s = createStepper(bus, 'pledge')
      const terms = pool(poolId)
      const k = kit()
      const me = identity()
      const tokenIndex = await s.step('Pick my next credit address', 'BSV-21', () => k.nextIndex(me), i => ({ detail: `receive address #${i}` }))
      const p = await s.step(STEP.buildPledge, 'BRC-100', () => buildPledge(wallet(), terms, String(credits), 'p2pkh', undefined, { tokenIndex }), r => ({ txid: r.txid, detail: `${r.satoshis} sat pledge coin + ${terms.feeSats} sat fee + OP_RETURN` }))
      await s.step(STEP.submitOverlay, 'overlay', () => overlay().submit(p.beef))
      const my: MyPledge = { poolId, label: terms.label, txid: p.txid, outpoint: p.outpoint, credits: p.record.credits, coinSats: p.satoshis, tokenIndex, instructions: p.instructions, status: 'pending', createdAt: new Date().toISOString() }
      mine.getState().upsertPledge(my)
      deps.getFeed()?.hello(me, [poolId])
      return my
    },

    async cancelPledge (outpoint) {
      const s = createStepper(bus, 'cancelPledge')
      const r = await s.step(STEP.cancelPledge, 'BRC-100', () => cancelPledge(wallet(), outpoint), x => ({ txid: x.txid }))
      await s.step('Tell the overlay (tm_agentcoop)', 'overlay', () => overlay().submit(r.beef))
      mine.getState().patchPledge(outpoint, { status: 'withdrawn' })
      return { txid: r.txid }
    },

    async reviewSignRequest (req) {
      const s = createStepper(bus, 'sign')
      const my = mine.getState().pledges.find(p => p.poolId === req.poolId && (p.status === 'pending' || p.status === 'signed'))
      if (my === undefined) throw new FlowError('sign', 'No active pledge of mine in this pool.')
      const offer = await s.step(STEP.fetchOffer, 'HTTP', () => coopApi.offer(req.poolId))
      const mineInPlan = req.plan.participants.find(p => p.outpoint === my.outpoint)
      const checks: SignReview['checks'] = []
      checks.push({ label: 'My pledge is in the plan', ok: mineInPlan !== undefined, stamp: 'AtomicBEEF' })
      checks.push({ label: `My ${my.credits} credits go to my address #${my.tokenIndex}`, ok: mineInPlan?.credits === my.credits, detail: mineInPlan?.credits })
      checks.push({ label: `My change (${mineInPlan?.changeSats ?? '?'} sat) comes back to my pledge key`, ok: mineInPlan !== undefined })
      const sum = req.plan.participants.reduce((a, p) => a + BigInt(p.credits), 0n)
      checks.push({ label: `Σ credits = N (${sum} = ${offer.terms.credits})`, ok: sum === BigInt(offer.terms.credits) })
      let ok = checks.every(c => c.ok === true)
      try {
        await s.step(STEP.verifySettlement, 'lineage', () =>
          verifySettlementPlan(req.plan, offer, my.outpoint, { expectedCredits: my.credits, expectedCreditPkh: receivePkh(identity(), my.tokenIndex), verifyLineage: true, lineage: { arcadeUrl: env.urls.arcade } }))
        checks.push({ label: 'Pledge-list hash and the provider\'s credit lineage', ok: true, stamp: 'SPV' })
      } catch (err) {
        checks.push({ label: 'Pledge-list hash and the provider\'s credit lineage', ok: false, detail: String((err as Error).message ?? err), stamp: 'SPV' })
        ok = false
      }
      return { request: req, pledge: my, myChangeSats: mineInPlan?.changeSats ?? '0', participants: req.plan.participants.length, checks, ok }
    },

    async sign (review) {
      const s = createStepper(bus, 'sign')
      const feed = deps.getFeed()
      if (feed === undefined || !feed.connected) throw new FlowError('sign', 'Not connected to the coordinator.')
      const unlock = await s.step(STEP.signInput, 'ALL', () =>
        signSettlementInput(review.request.plan, review.request.yourInputIndex, new P2pkhWalletSigner(wallet(), { protocolID: review.pledge.instructions.protocolID, keyID: review.pledge.instructions.keyID })))
      feed.send({ type: 'sign_response', poolId: review.request.poolId, round: review.request.round, inputIndex: review.request.yourInputIndex, unlockingScriptHex: unlock.toHex() })
      s.note(STEP.signatureSent, 'ALL', `round ${review.request.round}, input #${review.request.yourInputIndex}`)
      mine.getState().patchPledge(review.pledge.outpoint, { status: 'signed', plan: review.request.plan })
      store.getState().dismissNotification(`sign:${review.request.poolId}:${review.request.round}`)
    },

    async reject (req, reason) {
      deps.getFeed()?.send({ type: 'sign_reject', poolId: req.poolId, round: req.round, reason })
      store.getState().dismissNotification(`sign:${req.poolId}:${req.round}`)
    },

    async afterSettlement (poolId, txid) {
      const my = mine.getState().pledges.find(p => p.poolId === poolId && p.status !== 'settled' && p.status !== 'withdrawn')
      if (my === undefined) return
      const s = createStepper(bus, 'settled')
      if (my.plan === undefined || !my.plan.participants.some(p => p.outpoint === my.outpoint)) {
        mine.getState().patchPledge(my.outpoint, { status: 'left-out', settledTxid: txid })
        s.note('The pool settled without my pledge (wait list); my coin was not touched', 'ALL')
        return
      }
      const tx = await s.step('Fetch the settlement from the overlay', 'AtomicBEEF', async () => {
        for (let i = 0; i < 10; i++) {
          const [out] = await overlay().lookup({ op: 'settlement', poolId } as unknown as KitQuery)
          if (out !== undefined && out.txid === txid) return Transaction.fromBEEF(out.beef, txid)
          await new Promise(r => setTimeout(r, 400))
        }
        throw new FlowError('settled', 'settlement not on the overlay yet')
      })
      await s.step(STEP.takeChange, 'internalizeAction', () => internalizeSettlement(wallet(), tx, my.plan!, my.outpoint, my.instructions))
      await s.step(STEP.syncCredits, 'BSV-21', () => kit().sync(), r => ({ detail: `${r.inserted.length} new credit output(s)` }))
      mine.getState().patchPledge(my.outpoint, { status: 'settled', settledTxid: txid })
    },

    async credits () {
      const balances = await kit().balances()
      return balances.map(b => ({ tokenId: b.tokenId, sym: b.sym, overlay: b.overlay, basket: b.basket, utxos: b.utxos })) as CreditBalance[]
    },

    catalog: () => authJson<Catalog>('/v1/catalog'),
    prepaid: async () => (await authJson<{ balances: PrepaidBalance[] }>('/v1/credits/balance')).balances,

    async redeem (credits) {
      const s = createStepper(bus, 'redeem')
      const catalog = await s.step(STEP.readCatalog, 'BRC-103', () => authJson<Catalog>('/v1/catalog'))
      const product = catalog.products[0]
      if (product === undefined || product.tokenId === null) throw new FlowError('redeem', 'The provider has no credit token yet.')
      const k = kit()
      const sent = await s.step(`Send ${credits} credit(s) to the provider in BSV Desktop`, 'BSV-21', () => k.send(product.tokenId!, BigInt(credits), catalog.credits.redeemTo), r => ({ txid: r.txid }))
      const beef = await s.step('Collect the transfer\'s AtomicBEEF', 'AtomicBEEF', async () => {
        const [out] = await overlay().lookup({ op: 'outpoint', outpoint: `${sent.txid}_0` } as unknown as KitQuery)
        if (out === undefined) throw new FlowError('redeem', 'transfer not on the overlay yet')
        return out.beef
      })
      const r = await s.step(STEP.redeemAtProvider, 'BRC-103', () => authJson<{ prepaidMinutes: number }>('/v1/credits/redeem', { beef, outputIndex: 0 }))
      return { txid: sent.txid, prepaidMinutes: r.prepaidMinutes }
    },

    async runJob (kind, minutes) {
      const s = createStepper(bus, 'job')
      const r = await s.step(`Submit a ${minutes}-minute ${kind} job (402 paid by BSV Desktop if prepaid minutes run short)`, 'BRC-105', () => authJson<{ jobId: string }>('/v1/jobs', { kind, minutes }))
      return { jobId: r.jobId }
    },
    job: id => authJson<ProviderJob>(`/v1/jobs/${id}`),
    async returnCredits (credits) {
      const s = createStepper(bus, 'return')
      return await s.step(`Ask the provider to return ${credits} unused credit(s)`, 'BRC-103', () => authJson<{ txid: string, credits: number, prepaidMinutes: number }>('/v1/credits/return', { credits }), r => ({ txid: r.txid }))
    },

    async mint (args) {
      const s = createStepper(bus, 'mint')
      const r = await s.step(`Deploy ${args.sym} (${args.amt} units) in BSV Desktop`, 'BSV-21', () => kit().deploy(args), x => ({ txid: x.txid, detail: `tokenId ${x.tokenId}` }))
      mine.getState().setTokenId(r.tokenId)
      return r
    },

    async openPool (draft) {
      const s = createStepper(bus, 'openPool')
      const me = identity()
      const tokenId = mine.getState().tokenId
      if (tokenId === undefined) throw new FlowError('openPool', 'Mint credits first (the pool sells your token).')
      const w = wallet()
      const { height } = await w.getHeight({})
      const nonce = Utils.toHex(Random(16))
      // revenue key for this pool: [1,'agentcoop provider'] / keyID = nonce, counterparty 'anyone' (MASTER §3.2)
      const payScriptHex = await derivedP2pkhHex(w, PROVIDER_PROTOCOL, nonce)
      const terms: TermsDraft & Pick<PoolTerms, 'provider' | 'payScriptHex'> = {
        v: '1', provider: me, providerApi: env.urls.provider.startsWith('/') ? `${location.origin}${env.urls.provider}` : env.urls.provider, tokenId,
        credits: String(draft.credits), priceSats: String(draft.priceSats), payScriptHex, feeSats: String(draft.feeSats), minCredits: String(draft.minCredits),
        deadlineHeight: String(height + draft.deadlineBlocks), label: draft.label, retailSatsPerCredit: '50'
      }
      const announced = await s.step(STEP.reserveAnnounce, 'OP_RETURN', () => buildReserveAndAnnounce(w, kit(), terms, { poolNonce: nonce }), r => ({ txid: r.txid, detail: `poolId ${r.poolId}` }))
      const offer = await s.step(STEP.signOffer, 'SINGLE|ACP', () => signOffer(w, announced.poolId, announced.terms))
      await s.step(STEP.registerOffer, 'HTTP', () => coopApi.postOffer(offer))
      let offerTxid: string | undefined
      try { offerTxid = (await s.step('Publish the offer on chain (any coordinator can find it)', 'OP_RETURN', () => publishOffer(w, offer as Offer), r => ({ txid: r.txid }))).txid } catch { /* optional */ }
      mine.getState().addPool({ poolId: announced.poolId, nonce, label: draft.label, txid: announced.txid, createdAt: new Date().toISOString(), ...(offerTxid !== undefined ? { offerTxid } : {}) })
      return { poolId: announced.poolId, txid: announced.txid }
    },

    async cancelPool (poolId) {
      const s = createStepper(bus, 'cancelPool')
      const txid = await s.step(STEP.cancelPool, 'BRC-100', () => coreCancelPool(wallet(), kit(), poolId), t => ({ txid: t }))
      return { txid }
    },

    async revenue () {
      const listed = await wallet().listOutputs({ basket: REVENUE_BASKET, limit: 1000 })
      const outputs = listed.outputs.filter(o => o.spendable)
      return { outputs: outputs.length, satoshis: outputs.reduce((a, o) => a + o.satoshis, 0) }
    },

    async syncRevenue () {
      const s = createStepper(bus, 'syncRevenue')
      const w = wallet()
      let added = 0
      for (const p of mine.getState().pools) {
        for (const query of [{ op: 'pledges', poolId: p.poolId, includeSpent: true, includeInvalid: true }, { op: 'settlement', poolId: p.poolId }]) {
          const outputs = await s.step(`Read ${query.op} of ${p.label} from the overlay`, 'overlay', () => overlay().lookup(query as unknown as KitQuery))
          const terms = store.getState().pools.byId[p.poolId]?.terms
          if (terms === undefined) continue
          for (const o of outputs) {
            const paying = o.tx.outputs.map((out, vout) => ({ vout, hex: out.lockingScript.toHex() })).filter(x => x.hex === terms.payScriptHex)
            if (paying.length === 0) continue
            await s.step(`Track ${paying.length} revenue output(s) of ${o.txid.slice(0, 8)}…`, 'internalizeAction', () => w.internalizeAction({
              tx: o.beef, description: 'AgentCoop pool revenue', labels: ['agentcoop revenue'],
              outputs: paying.map(x => ({ outputIndex: x.vout, protocol: 'basket insertion' as const, insertionRemittance: { basket: REVENUE_BASKET, customInstructions: JSON.stringify({ protocolID: PROVIDER_PROTOCOL, keyID: p.nonce, counterparty: 'anyone' }), tags: ['agentcoop', 'revenue'] } }))
            }))
            added += paying.length
          }
        }
      }
      return { added }
    },

    async sweepRevenue () {
      const s = createStepper(bus, 'sweepRevenue')
      const w = wallet()
      const listed = await w.listOutputs({ basket: REVENUE_BASKET, include: 'entire transactions', includeCustomInstructions: true, limit: 1000 })
      const outputs = listed.outputs.filter(o => o.spendable && o.customInstructions !== undefined)
      if (outputs.length === 0) return undefined
      const total = outputs.reduce((a, o) => a + o.satoshis, 0)
      const created = await s.step(`Sweep ${outputs.length} revenue output(s), ${total} sat, into your balance`, 'BRC-100', () => w.createAction({
        description: 'Sweep AgentCoop pool revenue', labels: ['agentcoop revenue'], inputBEEF: Array.from(listed.BEEF ?? []),
        inputs: outputs.map(o => ({ outpoint: o.outpoint, unlockingScriptLength: P2PKH_UNLOCKING_SCRIPT_LENGTH, inputDescription: 'Pool revenue' })),
        outputs: [], options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
      }))
      const signable = created.signableTransaction
      if (signable === undefined) throw new FlowError('sweepRevenue', 'the wallet did not return a signable transaction')
      const tx = Transaction.fromAtomicBEEF(signable.tx)
      const spends: Record<number, { unlockingScript: string }> = {}
      for (const o of outputs) {
        const [txid, vout] = o.outpoint.split('.')
        const i = tx.inputs.findIndex(inp => (inp.sourceTXID ?? inp.sourceTransaction?.id('hex')) === txid && inp.sourceOutputIndex === Number(vout))
        if (i === -1) throw new FlowError('sweepRevenue', `revenue input ${o.outpoint} missing from the signable transaction`)
        const ci = JSON.parse(o.customInstructions!) as CustomInstructions
        spends[i] = { unlockingScript: (await signWalletP2pkhInput(w, tx, i, { protocolID: ci.protocolID, keyID: ci.keyID })).toHex() }
      }
      const signed = await s.step('Sign each revenue input in BSV Desktop', 'BRC-100', () => w.signAction({ reference: signable.reference, spends, options: { acceptDelayedBroadcast: false } }), r => ({ txid: r.txid }))
      if (signed.txid === undefined) throw new FlowError('sweepRevenue', 'the wallet did not complete the sweep')
      return { txid: signed.txid, satoshis: total }
    },

    // ── owner: vault + guard (MASTER §3.7; Track D's vault-ops mirrored in ./vaultOps.ts) ──
    async createVault (agent) {
      const s = createStepper(bus, 'createVault')
      const guard = await s.step('Ask the guard who it is (/healthz)', 'HTTP', () => guardApi.healthz(), g => ({ detail: `${g.network} · ${g.identityKey.slice(0, 12)}…` }))
      const v = await s.step(STEP.deriveVault, 'BRC-100', () => opCreateVault(wallet(), { agent, guard: guard.identityKey }), r => ({ detail: `vault ${r.vaultId.slice(0, 8)}… · ${r.lockingScriptHex.length / 2} bytes` }))
      await s.step(STEP.registerVault, '2-of-2', () => registerVault(auth(), env.urls.guard, v))
      mine.getState().addVault(v)
      bus.publish(makeEvent('guard', 'vault_registered', { vaultId: v.vaultId, owner: v.record.owner, agent }, { agent }))
      return v
    },

    async fundVault (vaultId, satoshis) {
      const s = createStepper(bus, 'fundVault')
      const v = mine.getState().vaults.find(x => x.vaultId === vaultId)
      if (v === undefined) throw new FlowError('fundVault', 'Create the vault in this browser first (its script is kept here).')
      const r = await s.step(`Fund the vault with ${satoshis} sat in BSV Desktop (T9: out0 vault coin, out1 OP_RETURN record)`, 'BRC-100', () => opFundVault(wallet(), v, satoshis), x => ({ txid: x.txid }))
      await s.step(STEP.submitOverlay, 'overlay', () => overlay().submit(r.tx)).catch(() => { s.note('Overlay did not take the vault record (the guard and the chain still have it)', 'overlay') })
      mine.getState().patchVault(vaultId, { fundedSats: v.fundedSats + satoshis, lastTxid: r.txid })
      const view: VaultView = { vaultId, owner: v.record.owner, agent: v.agent, guard: v.guard, scriptHex: v.lockingScriptHex, verified: true, balanceSats: v.fundedSats + satoshis, utxos: [{ outpoint: `${r.txid}_${r.vout}`, satoshis }] }
      bus.publish(makeEvent('overlay', 'vault_funded', { vault: view, txid: r.txid }, { txid: r.txid, agent: v.agent }))
      return { txid: r.txid }
    },

    async putPolicy (agent, policy) {
      const s = createStepper(bus, 'putPolicy')
      await s.step(STEP.putPolicy, 'BRC-103', async () => {
        const res = await auth().fetch(`${env.urls.guard}/policies/${agent}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(policy) })
        if (!res.ok) throw new FlowError('putPolicy', `guard answered ${res.status}: ${(await res.text()).slice(0, 200)}`)
      }, () => ({ detail: `maxPerPool ${policy.maxPerPoolSats} · weekly ${policy.weeklyCapSats} · maxFee ${policy.maxFeeSats} · hot/day ${policy.hotWalletDailySats}` }))
      bus.publish(makeEvent('guard', 'policy_updated', { agent, owner: identity() }, { agent }))
    },

    async vaultStatus (vaultId) {
      const a = auth()
      const get = async <T>(path: string): Promise<T | undefined> => { const res = await a.fetch(`${env.urls.guard}${path}`); return res.ok ? await res.json() as T : undefined }
      const view = await get<VaultView & { policy?: GuardPolicyResponse['policy'], spentLast7dSats?: number }>(`/vaults/${vaultId}`)
      const agent = view?.agent ?? mine.getState().vaults.find(v => v.vaultId === vaultId)?.agent
      const pol = agent !== undefined ? await get<GuardPolicyResponse>(`/policies/${agent}`) : undefined
      const dec = agent !== undefined ? await get<{ decisions: GuardDecision[] }>(`/decisions?agent=${agent}&limit=100`) : undefined
      return { ...(view !== undefined ? { vault: view } : {}), ...(pol !== undefined ? { policy: pol.policy, policyUpdatedAt: pol.updatedAt } : {}), decisions: dec?.decisions ?? [], ...(view?.spentLast7dSats !== undefined ? { spentLast7dSats: view.spentLast7dSats } : {}) }
    },

    async withdrawVault (vaultId) {
      const s = createStepper(bus, 'withdrawVault')
      const v = mine.getState().vaults.find(x => x.vaultId === vaultId)
      if (v === undefined) throw new FlowError('withdrawVault', 'This browser does not hold that vault\'s script (created elsewhere).')
      let utxos = await s.step('List the vault outputs your Desktop wallet tracks (basket agentcoop vault)', 'BRC-100', () => ownerBasketUtxos(wallet(), v), u => ({ detail: `${u.length} output(s)` }))
      if (utxos.length === 0) {
        utxos = await s.step('Ask the guard which vault outputs are unspent and fetch their BEEF from Arcade', 'SPV', async () => {
          const res = await auth().fetch(`${env.urls.guard}/vaults/${vaultId}`)
          if (!res.ok) return [] as VaultUtxo[]
          const view = await res.json() as VaultView
          const out: VaultUtxo[] = []
          for (const u of view.utxos) { const [txid] = u.outpoint.split(/[_.]/); out.push({ outpoint: u.outpoint.replace('_', '.'), satoshis: u.satoshis, lockingScriptHex: v.lockingScriptHex, beef: await beefFromArcade(txid!, env.urls.arcade) }) }
          return out
        }, u => ({ detail: `${u.length} output(s)` }))
      }
      const r = await s.step(`Spend ${utxos.length} vault output(s) through the owner branch (OP_IF): no guard, no agent`, 'BRC-100', () => opWithdrawVault(wallet(), v, utxos), x => ({ txid: x.txid, detail: `${x.satoshis} sat` }))
      const view: VaultView = { vaultId, owner: v.record.owner, agent: v.agent, guard: v.guard, scriptHex: v.lockingScriptHex, verified: true, balanceSats: 0, utxos: [] }
      bus.publish(makeEvent('overlay', 'vault_spent', { vault: view, txid: r.txid, by: 'owner' }, { txid: r.txid, agent: v.agent }))
      return r
    },

    // ── market (A-P2 builders, B's /listings) ──
    listings: () => coopApi.listings(),

    async listCredits (credits, askSats) {
      const s = createStepper(bus, 'list')
      const k = kit()
      const balances = await k.balances()
      const token = balances.find(b => b.basket >= BigInt(credits))
      if (token === undefined) throw new FlowError('list', 'You do not hold that many credits of one token.')
      const r = await s.step(`Move ${credits} credits to a listing key in BSV Desktop (basket agentcoop listings) + OP_RETURN list`, 'OP_RETURN', () => reserveListing(wallet(), k, token.tokenId, String(credits), String(askSats)), x => ({ txid: x.txid }))
      await s.step(STEP.submitOverlay, 'overlay', () => overlay().submit(r.beef))
      const listing = await s.step(STEP.signListing, 'SINGLE|ACP', () => signListing(wallet(), r.outpoint, String(askSats)))
      await s.step(STEP.postListing, 'HTTP', () => coopApi.postListing(listing))
      bus.publish(makeEvent('overlay', 'listing_added', { listing }, { txid: r.txid, agent: identity() }))
      return { txid: r.txid, outpoint: r.outpoint }
    },

    async cancelListing (outpoint) {
      const s = createStepper(bus, 'cancelListing')
      const listing = store.getState().listings.byOutpoint[outpoint]
      const txid = await s.step(STEP.cancelListing, 'BRC-100', () => coreCancelListing(wallet(), kit(), outpoint), t => ({ txid: t }))
      if (listing !== undefined) bus.publish(makeEvent('overlay', 'listing_cancelled', { listing, txid }, { txid, agent: identity() }))
      return { txid }
    },

    async sweep (outpoints) {
      const s = createStepper(bus, 'sweep')
      const all = await s.step('Fetch the current listings from the coordinator', 'HTTP', () => coopApi.listings())
      const picked = all.filter(l => outpoints.includes(l.outpoint))
      if (picked.length === 0) throw new FlowError('sweep', 'Those listings are gone (swept or cancelled).')
      const total = picked.reduce((a, l) => a + Number(l.askSats), 0)
      const r = await s.step(`Verify each listing and its credit lineage (SPV, Arcade), then buy ${picked.length} in one transaction (SIGHASH_ALL)`, 'lineage', () => buildSweep(wallet(), kit(), picked, { verifyLineage: true, lineage: { arcadeUrl: env.urls.arcade } }), x => ({ txid: x.txid, detail: `${x.credits} credits · ${total} sat` }))
      for (const l of picked) bus.publish(makeEvent('overlay', 'listing_filled', { listing: l, txid: r.txid, buyer: identity() }, { txid: r.txid, agent: identity() }))
      return { txid: r.txid, credits: r.credits, satoshis: total }
    }
  }
}
