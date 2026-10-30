/**
 * Walking skeleton (track A 1.7), offline: one provider and two agents, real
 * wallet-toolbox wallets on the mock chain, the kit's token overlay over HTTP
 * with SPV. One transaction pays the provider and delivers every agent's
 * credits (DvP). Track B's tm_agentcoop replaces the kit topic later; the
 * admission rules are the same.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Wallet } from '@bsv/wallet-toolbox'
import { Transaction } from '@agentcoop/core/sdk'
import {
  OverlayClient,
  P2pkhWalletSigner,
  PLEDGE_BASKET,
  TokenKit,
  assembleSettlement,
  buildPledge,
  buildReserveAndAnnounce,
  cancelPledge,
  internalizeSettlement,
  parseOutpoint,
  planSettlement,
  planTransaction,
  receivePkh,
  signOffer,
  signSettlementInput,
  verifyLineage,
  verifyOffer,
  verifySettlementPlan,
  type Offer,
  type PledgeCandidate,
  type PoolTerms,
  type SettlementPlan
} from '@agentcoop/core'
import { startOverlay, type RunningOverlay } from '../docs/starter/bsv21-token-kit/overlay/server'
import { createMockChain, type MockChain } from './helpers/mockchain'

let chain: MockChain
let overlay: RunningOverlay

beforeAll(async () => {
  chain = await createMockChain()
  overlay = await startOverlay({ port: 18191, dbFile: join(mkdtempSync(join(tmpdir(), 'agentcoop-')), 'overlay.db'), chainTracker: chain.chainTracker, quiet: true })
})
afterAll(async () => {
  await overlay?.close()
  await chain?.close()
})

type Pledged = Awaited<ReturnType<typeof buildPledge>>
const candidate = (p: Pledged): PledgeCandidate => {
  const sourceTx = Transaction.fromAtomicBEEF(p.beef)
  return { outpoint: p.outpoint, satoshis: p.satoshis, lockingScriptHex: sourceTx.outputs[parseOutpoint(p.outpoint).vout].lockingScript.toHex(), record: p.record, sourceTx }
}

describe('walking skeleton: one atomic DvP settlement', () => {
  let provider: Wallet, agent1: Wallet, agent2: Wallet
  let kitP: TokenKit, kit1: TokenKit, kit2: TokenKit
  let id1: string, id2: string
  let terms: PoolTerms
  let offer: Offer
  let offerSourceTx: Transaction
  let p1: Pledged, p2: Pledged
  let plan: SettlementPlan
  let height: number

  it('sets up a provider and two agents', async () => {
    provider = await chain.makeWallet(); agent1 = await chain.makeWallet(); agent2 = await chain.makeWallet()
    for (const w of [provider, agent1, agent2]) await chain.fund(w)
    kitP = new TokenKit(provider, new OverlayClient(overlay.url))
    kit1 = new TokenKit(agent1, new OverlayClient(overlay.url))
    kit2 = new TokenKit(agent2, new OverlayClient(overlay.url))
    id1 = await kit1.identityKey(); id2 = await kit2.identityKey()
    height = await chain.services.getHeight()
  })

  it('T1+T2: provider deploys 1,000 credits, reserves them and announces the pool', async () => {
    const { tokenId } = await kitP.deploy({ sym: 'H100MIN', amt: 1000n, dec: 0 })
    const reserved = await buildReserveAndAnnounce(provider, kitP, {
      v: '1', providerApi: 'http://localhost:8092', tokenId, credits: '1000', priceSats: '10000', feeSats: '50',
      minCredits: '100', deadlineHeight: String(height + 144), label: '8×H100 · 1 week', retailSatsPerCredit: '15'
    })
    terms = reserved.terms
    expect(terms.poolId).toBe(`${reserved.txid}_0`)
    offerSourceTx = Transaction.fromAtomicBEEF(reserved.beef)
    // The overlay admitted the reserved credit UTXO.
    expect(await kitP.overlay.lookup({ op: 'outpoint', txid: reserved.txid, vout: 0 })).toHaveLength(1)
    // TokenKit does not see the offer UTXO as spendable (different key, different basket).
    expect((await kitP.spendable(tokenId)).entries.map(e => e.outpoint)).not.toContain(`${reserved.txid}.0`)
  })

  it('signs the open offer SINGLE|ACP; anyone can verify it offline', async () => {
    offer = await signOffer(provider, terms.poolId, terms)
    expect(() => verifyOffer(offer, { sourceTx: offerSourceTx })).not.toThrow()
    expect(() => verifyOffer({ ...offer, terms: { ...terms, priceSats: '9000' } }, { sourceTx: offerSourceTx })).toThrow(/does not verify/)
  })

  it('T3: agent 1 pledges 600, agent 2 pledges 400; a second active pledge is refused', async () => {
    p1 = await buildPledge(agent1, terms, '600', 'p2pkh', undefined, { tokenIndex: await kit1.nextIndex(id1) })
    p2 = await buildPledge(agent2, terms, '400', 'p2pkh', undefined, { tokenIndex: await kit2.nextIndex(id2) })
    await expect(buildPledge(agent1, terms, '100', 'p2pkh', undefined, { tokenIndex: 0 })).rejects.toThrow(/one at a time/)
  })

  it('coordinator plans; each agent verifies the whole transaction and signs ALL', async () => {
    plan = planSettlement(offer, [candidate(p2), candidate(p1)], { height, satsPerKb: 100, offerSourceTx })
    expect(plan.participants.map(p => p.credits).sort()).toEqual(['400', '600'])
    await verifySettlementPlan(plan, offer, p1.outpoint, { expectedCredits: '600', expectedCreditPkh: receivePkh(id1, Number(p1.record.tokenIndex)) })
    await verifySettlementPlan(plan, offer, p2.outpoint, { expectedCredits: '400', expectedCreditPkh: receivePkh(id2, Number(p2.record.tokenIndex)) })
    await expect(verifySettlementPlan(plan, offer, p2.outpoint, { expectedCredits: '400', expectedCreditPkh: receivePkh(id1, 0) })).rejects.toThrow(/pays someone else/)
  })

  it('verifyLineage: the agent checks the offer credits back to the deploy itself (no overlay)', async () => {
    const fetchTx = async (txid: string): Promise<Transaction> =>
      Transaction.fromBinary(Array.from((await (chain.services as any).storage.getTransaction(txid)).rawTx as number[]))
    await verifySettlementPlan(plan, offer, p1.outpoint, { expectedCredits: '600', verifyLineage: true, lineage: { fetchTx } })
    const r = await verifyLineage(offer.poolId, { fetchTx })
    expect(r).toMatchObject({ ok: true, tokenId: terms.tokenId, amt: 1000n, depth: 1 })
  })

  let settlement: Transaction
  it('T5: assemble, broadcast, overlay admits the credits; agents receive them and their change', async () => {
    const sigs: Record<number, any> = {}
    for (const [p, w] of [[p1, agent1], [p2, agent2]] as const) {
      const i = plan.participants.findIndex(x => x.outpoint === p.outpoint) + 1
      sigs[i] = await signSettlementInput(plan, i, new P2pkhWalletSigner(w, { protocolID: p.instructions.protocolID, keyID: p.instructions.keyID }))
    }
    settlement = assembleSettlement(plan, sigs)
    expect(await settlement.verify('scripts only')).toBe(true)

    // Agent 1's wallet broadcasts it (mock chain); agent 2 then sees "already known".
    await internalizeSettlement(agent1, settlement, plan, p1.outpoint, p1.instructions)
    await internalizeSettlement(agent2, settlement, plan, p2.outpoint, p2.instructions)
    await kitP.overlay.submit(settlement.toAtomicBEEF())

    await kit1.sync(); await kit2.sync()
    expect((await kit1.balances()).find(b => b.tokenId === terms.tokenId)).toMatchObject({ overlay: 600n, basket: 600n })
    expect((await kit2.balances()).find(b => b.tokenId === terms.tokenId)).toMatchObject({ overlay: 400n, basket: 400n })

    // Provider paid exactly P at output 0, in the same transaction.
    expect(settlement.outputs[0].satoshis).toBe(10000)
    expect(settlement.outputs[0].lockingScript.toHex()).toBe(terms.payScriptHex)

    // Change is back in the agents' 'agentcoop' basket; the spent pledge coin is gone.
    const basket = await agent1.listOutputs({ basket: PLEDGE_BASKET, includeCustomInstructions: true })
    expect(basket.outputs.map(o => o.outpoint)).not.toContain(p1.outpoint.replace('_', '.'))
    expect(basket.outputs.some(o => JSON.parse(o.customInstructions ?? '{}').change === true)).toBe(true)
  })

  it('a coordinator that alters the plan after signing gets nothing valid', async () => {
    const tx = planTransaction(plan)
    const n = plan.participants.length
    tx.outputs[n + 1].satoshis = tx.outputs[n + 1].satoshis! - 100 // shave a participant's change
    const tampered = { ...plan, templateBEEF: tx.toAtomicBEEF() }
    await expect(verifySettlementPlan(tampered, offer, plan.participants[0].outpoint, { expectedCredits: plan.participants[0].credits })).rejects.toThrow(/BAD_PLAN/)
    const sigs = Object.fromEntries(settlement.inputs.map((inp, i) => [i, inp.unlockingScript!]).slice(1))
    expect(() => assembleSettlement(tampered, sigs)).toThrow(/BAD_SIGNATURE/)
  })
})

describe('failed pool: nothing moves', () => {
  it('after the deadline no plan exists, and the pledge is withdrawn intact', async () => {
    const provider = await chain.makeWallet(); const agent = await chain.makeWallet()
    await chain.fund(provider); await chain.fund(agent)
    const kitP = new TokenKit(provider, new OverlayClient(overlay.url))
    const kitA = new TokenKit(agent, new OverlayClient(overlay.url))
    const height = await chain.services.getHeight()
    const { tokenId } = await kitP.deploy({ sym: 'FAIL', amt: 500n, dec: 0 })
    const reserved = await buildReserveAndAnnounce(provider, kitP, {
      v: '1', providerApi: 'http://localhost:8092', tokenId, credits: '500', priceSats: '5000', feeSats: '50',
      minCredits: '100', deadlineHeight: String(height + 1), label: 'deadline test', retailSatsPerCredit: '15'
    })
    const offer = await signOffer(provider, reserved.terms.poolId, reserved.terms)
    const p = await buildPledge(agent, reserved.terms, '200', 'p2pkh', undefined, { tokenIndex: await kitA.nextIndex(await kitA.identityKey()) })
    const chainInfo = { satsPerKb: 100, offerSourceTx: Transaction.fromAtomicBEEF(reserved.beef) }

    expect(() => planSettlement(offer, [candidate(p)], { ...chainInfo, height })).toThrow(/cannot fill exactly 500/) // under-filled
    await chain.mineBlock(); await chain.mineBlock()
    const later = await chain.services.getHeight()
    expect(() => planSettlement(offer, [candidate(p)], { ...chainInfo, height: later })).toThrow(/DEADLINE_PASSED/)

    const { txid, beef } = await cancelPledge(agent, p.outpoint)
    expect(txid).toMatch(/^[0-9a-f]{64}$/)
    const withdrawal = Transaction.fromAtomicBEEF(beef)
    expect(withdrawal.id('hex')).toBe(txid)
    expect(withdrawal.inputs.some(i => `${i.sourceTXID ?? i.sourceTransaction?.id('hex')}_${i.sourceOutputIndex}` === p.outpoint)).toBe(true)
    const left = await agent.listOutputs({ basket: PLEDGE_BASKET })
    expect(left.outputs.filter(o => o.spendable).map(o => o.outpoint)).not.toContain(p.outpoint.replace('_', '.'))
  })
})
