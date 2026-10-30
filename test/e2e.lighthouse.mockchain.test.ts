/**
 * Track A 5.5–5.7, offline: lighthouse pledges. Two humans pledge once
 * (SINGLE|ANYONECANPAY over their own credit output) and go offline; one
 * interactive agent pledges as usual. The humans' guard checks the whole
 * settlement and co-signs ALL; one transaction settles everyone.
 *
 * Also: the human's signature alone is not enough to take the coin (a thief
 * with a fake credit output gets nowhere), the guard refuses a plan that pays
 * the human's credits elsewhere, a guard the human did not name cannot sign,
 * and the human can withdraw alone at any time.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LockingScript, P2PKH, Transaction, UnlockingScript, Utils } from '@agentcoop/core/sdk'
import type { Wallet } from '@bsv/wallet-toolbox'
import {
  COOP_SERVICE, COOP_TOPIC, LIGHTHOUSE_BASKET, OverlayClient, P2pkhWalletSigner, TokenKit,
  assembleSettlement, buildBsv21Script, buildLighthousePledge, buildPledge, buildReserveAndAnnounce, cancelLighthousePledge, cosignLighthouse,
  inputScriptValid, internalizeSettlement, lighthouseLockingScript, parseOutpoint, planSettlement, planTransaction, receivePkh, signOffer,
  signSettlementInput, vaultCosignUnlock, verifyLighthousePledge, verifySettlementPlan,
  type LighthousePledge, type Offer, type PledgeCandidate, type PoolTerms, type SettlementPlan
} from '@agentcoop/core'
import { startOverlay, type RunningOverlay } from '../packages/overlay/src/server'
import { createMockChain, type MockChain } from './helpers/mockchain'

let chain: MockChain
let overlay: RunningOverlay

const fetchTx = async (txid: string): Promise<Transaction> =>
  Transaction.fromBinary(Array.from((await (chain.services as any).storage.getTransaction(txid)).rawTx as number[]))
const kitFor = (w: Wallet): TokenKit => new TokenKit(w, new OverlayClient(overlay.url, undefined, 'main', undefined, COOP_TOPIC, COOP_SERVICE))
const candidate = (p: { outpoint: string, satoshis: number, record: any, beef: number[] }): PledgeCandidate => {
  const sourceTx = Transaction.fromAtomicBEEF(p.beef)
  return { outpoint: p.outpoint, satoshis: p.satoshis, record: p.record, sourceTx, lockingScriptHex: sourceTx.outputs[parseOutpoint(p.outpoint).vout].lockingScript.toHex() }
}

beforeAll(async () => {
  chain = await createMockChain()
  overlay = await startOverlay({ port: 18794, dbFile: join(mkdtempSync(join(tmpdir(), 'agentcoop-lh-')), 'overlay.db'), chainTracker: chain.chainTracker, quiet: true })
}, 60_000)
afterAll(async () => { await overlay?.close(); await chain?.close() })

describe('lighthouse: offline humans settle with an interactive agent (A 5.5–5.7)', () => {
  let provider: Wallet, agent: Wallet, human1: Wallet, human2: Wallet, guard: Wallet, otherGuard: Wallet
  let kitP: TokenKit, kitA: TokenKit
  let terms: PoolTerms
  let offer: Offer
  let offerSourceTx: Transaction
  let aPledge: Awaited<ReturnType<typeof buildPledge>>
  let h1: LighthousePledge, h2: LighthousePledge
  let plan: SettlementPlan
  const at = (p: { outpoint: string }): number => 1 + plan.participants.findIndex(x => x.outpoint === p.outpoint) // input = credit output index

  it('setup: a pool of 1,000 credits (P = 10,000 sats)', async () => {
    ;[provider, agent, human1, human2, guard, otherGuard] = await Promise.all(Array.from({ length: 6 }, async () => await chain.makeWallet()))
    for (const w of [provider, agent, human1, human2]) await chain.fund(w)
    ;[kitP, kitA] = [kitFor(provider), kitFor(agent)]
    const height = await chain.services.getHeight()
    const { tokenId } = await kitP.deploy({ sym: 'LIGHT', amt: 1000n, dec: 0 })
    const reserved = await buildReserveAndAnnounce(provider, kitP, {
      v: '1', providerApi: 'http://localhost:8092', tokenId, credits: '1000', priceSats: '10000', feeSats: '50',
      minCredits: '100', deadlineHeight: String(height + 144), label: 'lighthouse', retailSatsPerCredit: '15'
    })
    terms = reserved.terms
    offerSourceTx = Transaction.fromAtomicBEEF(reserved.beef)
    offer = await signOffer(provider, terms.poolId, terms)
  })

  it('humans pledge once (exact coin, SINGLE|ACP over their own credits) and go offline; the agent pledges as usual', async () => {
    h1 = await buildLighthousePledge(human1, terms, '300', { tokenIndex: await kitFor(human1).nextIndex(human1.identityKey), guard: guard.identityKey })
    h2 = await buildLighthousePledge(human2, terms, '200', { tokenIndex: await kitFor(human2).nextIndex(human2.identityKey), guard: guard.identityKey, feeSats: 150 })
    aPledge = await buildPledge(agent, terms, '500', 'p2pkh', undefined, { tokenIndex: await kitA.nextIndex(agent.identityKey) })
    expect(h1.satoshis).toBe(3_000 + 1 + 100) // share + credit output + the human's fee
    expect(h2.satoshis).toBe(2_000 + 1 + 150)
    expect(h1.record).toMatchObject({ signer: 'vault', mode: 'lighthouse', guard: guard.identityKey })
    expect(Transaction.fromAtomicBEEF(h1.beef).outputs[0].lockingScript.toHex()).toBe(lighthouseLockingScript(h1.record).toHex())
    for (const p of [h1, h2]) expect(verifyLighthousePledge(p, { sourceTx: Transaction.fromAtomicBEEF(p.beef), tokenId: terms.tokenId })).toEqual(p.record)
    const sig = Utils.toArray(h1.humanSignatureHex, 'hex'); sig[10] ^= 1
    expect(() => verifyLighthousePledge({ ...h1, humanSignatureHex: Utils.toHex(sig) }, { sourceTx: Transaction.fromAtomicBEEF(h1.beef), tokenId: terms.tokenId })).toThrow(/human signature does not verify/)
    expect((await human1.listOutputs({ basket: LIGHTHOUSE_BASKET })).outputs).toHaveLength(1)
    for (const p of [h1, h2, aPledge]) await kitA.overlay.submit(p.beef)
  })

  it('a thief with only the human\'s signature cannot take the coin (fake credit output, the rest to itself)', async () => {
    const pledgeTx = Transaction.fromAtomicBEEF(h1.beef)
    const theft = new Transaction()
    theft.addInput({ sourceTransaction: pledgeTx, sourceOutputIndex: 0, sequence: 0xffffffff })
    theft.addOutput({ lockingScript: LockingScript.fromHex(h1.creditLockingScriptHex), satoshis: 1 }) // exactly what the human signed: "k credits" from nowhere
    theft.addOutput({ lockingScript: new P2PKH().lock(Utils.toArray('11'.repeat(20), 'hex')), satoshis: h1.satoshis - 50 })
    const human = Utils.toArray(h1.humanSignatureHex, 'hex')
    for (const unlock of [vaultCosignUnlock(human, human), new UnlockingScript([{ op: human.length, data: human }, { op: 0x51 }])]) {
      theft.inputs[0].unlockingScript = unlock
      expect(inputScriptValid(theft, 0)).toBe(false)
    }
  })

  it('plan: interactive first, lighthouse after; no change for lighthouse; the agent pays only the fee the coins do not cover', async () => {
    const height = await chain.services.getHeight()
    plan = planSettlement(offer, [candidate(h2), candidate(aPledge), candidate(h1)], { height, satsPerKb: 100, offerSourceTx })
    expect(plan.participants[0]).toMatchObject({ outpoint: aPledge.outpoint, credits: '500' })
    expect(plan.participants[0].mode).toBeUndefined()
    expect(plan.participants.slice(1).map(p => [p.mode, p.changeSats]).sort()).toEqual([['lighthouse', '0'], ['lighthouse', '0']])
    const tx = planTransaction(plan)
    expect(tx.outputs).toHaveLength(1 + 3 + 1 + 1) // payment, 3 credits, 1 change, settle record
    // both humans signed with their coin at index 0; here they sit at 2 and 3, each next to its own credits.
    for (const h of [h1, h2]) expect(tx.outputs[at(h)].lockingScript.toHex()).toBe(h.creditLockingScriptHex)
    expect(Math.min(at(h1), at(h2))).toBe(2)
    await verifySettlementPlan(plan, offer, aPledge.outpoint, { expectedCredits: '500', expectedCreditPkh: receivePkh(agent.identityKey, Number(aPledge.record.tokenIndex)), verifyLineage: true, lineage: { fetchTx } })
  })

  it('the guard refuses a plan that pays a human\'s credits elsewhere, and a guard the human did not name cannot sign', async () => {
    const tx = planTransaction(plan)
    tx.outputs[at(h1)].lockingScript = buildBsv21Script({ op: 'transfer', id: terms.tokenId, amt: '300' }, receivePkh(agent.identityKey, 99))
    const tampered: SettlementPlan = { ...plan, templateBEEF: tx.toAtomicBEEF() }
    await expect(cosignLighthouse(guard, { plan: tampered, offer, inputIndex: at(h1), pledge: h1, lineage: { fetchTx } })).rejects.toThrow(/does not pay the lighthouse pledger/)
    await expect(cosignLighthouse(otherGuard, { plan, offer, inputIndex: at(h1), pledge: h1, lineage: { fetchTx } })).rejects.toThrow(/names another guard/)
    await expect(cosignLighthouse(guard, { plan, offer, inputIndex: at(h2), pledge: h1, lineage: { fetchTx } })).rejects.toThrow(/is not/) // wrong input
    await expect(cosignLighthouse(guard, { plan: { ...plan, poolId: `${'00'.repeat(32)}_0` }, offer, inputIndex: at(h1), pledge: h1, lineage: { fetchTx } })).rejects.toThrow(/pledged to/)
  })

  it('settle: the agent signs ALL, the guard co-signs both humans; one transaction; everyone gets their credits', async () => {
    const sigs: Record<number, UnlockingScript> = {}
    sigs[1] = await signSettlementInput(plan, 1, new P2pkhWalletSigner(agent, { protocolID: aPledge.instructions.protocolID, keyID: aPledge.instructions.keyID }))
    for (const h of [h1, h2]) sigs[at(h)] = await cosignLighthouse(guard, { plan, offer, inputIndex: at(h), pledge: h, lineage: { fetchTx } })
    const settlement = assembleSettlement(plan, sigs)
    expect(await settlement.verify('scripts only')).toBe(true)
    expect(settlement.outputs[0].satoshis).toBe(10_000)
    await internalizeSettlement(agent, settlement, plan, aPledge.outpoint, aPledge.instructions) // broadcasts (mock chain)
    await kitA.overlay.submit(settlement.toAtomicBEEF())
    // the humans come back online later and simply sync
    const [k1, k2] = [kitFor(human1), kitFor(human2)]
    await kitA.sync(); await k1.sync(); await k2.sync()
    expect((await kitA.balances()).find(b => b.tokenId === terms.tokenId)?.overlay).toBe(500n)
    expect((await k1.balances()).find(b => b.tokenId === terms.tokenId)?.overlay).toBe(300n)
    expect((await k2.balances()).find(b => b.tokenId === terms.tokenId)?.overlay).toBe(200n)
  })

  it('a human withdraws a lighthouse pledge alone, without the guard', async () => {
    const human3 = await chain.makeWallet(); await chain.fund(human3)
    const h3 = await buildLighthousePledge(human3, terms, '100', { tokenIndex: 0, guard: guard.identityKey })
    const { txid, beef } = await cancelLighthousePledge(human3, h3.outpoint)
    const w = Transaction.fromAtomicBEEF(beef)
    expect(w.id('hex')).toBe(txid)
    expect(w.inputs.some(i => `${i.sourceTXID ?? i.sourceTransaction?.id('hex')}_${i.sourceOutputIndex}` === h3.outpoint)).toBe(true)
    expect((await human3.listOutputs({ basket: LIGHTHOUSE_BASKET })).outputs.filter(o => o.spendable)).toHaveLength(0)
    await expect(buildLighthousePledge(human3, terms, '100', { tokenIndex: 0, guard: human3.identityKey })).rejects.toThrow(/guard must be someone else/)
  })
})
