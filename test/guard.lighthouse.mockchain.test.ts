/**
 * D-P2c: the guard's POST /cosign kind 'lighthouse' (Track A 5.5–5.7) over HTTP, as the
 * coordinator calls it (lighthouseCosign). Two humans pledge once and go offline; the guard
 * they named co-signs their inputs after Track A's cosignLighthouse checks; one settlement
 * with an interactive agent verifies. The guard takes the offer from the plan itself.
 */
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Transaction, UnlockingScript } from '@agentcoop/core/sdk'
import type { Wallet } from '@bsv/wallet-toolbox'
import {
  COOP_SERVICE, COOP_TOPIC, OverlayClient, P2pkhWalletSigner, TokenKit,
  assembleSettlement, buildBsv21Script, buildLighthousePledge, buildPledge, buildReserveAndAnnounce, internalizeSettlement,
  parseOutpoint, planSettlement, planTransaction, receivePkh, signOffer, signSettlementInput,
  type LighthousePledge, type Offer, type PledgeCandidate, type PoolTerms, type SettlementPlan
} from '@agentcoop/core'
import { CosignRejected, lighthouseCosign } from '@agentcoop/core/signers/VaultSigner'
import { Guard } from '../apps/guard/src/guard'
import { createGuardApp } from '../apps/guard/src/server'
import { startOverlay, type RunningOverlay } from '../packages/overlay/src/server'
import { createMockChain, type MockChain } from './helpers/mockchain'

let chain: MockChain
let overlay: RunningOverlay
const servers: Server[] = []
const logs: string[] = []

const fetchTx = async (txid: string): Promise<Transaction> =>
  Transaction.fromBinary(Array.from((await (chain.services as any).storage.getTransaction(txid)).rawTx as number[]))
const kitFor = (w: Wallet): TokenKit => new TokenKit(w, new OverlayClient(overlay.url, undefined, 'main', undefined, COOP_TOPIC, COOP_SERVICE))
const candidate = (p: { outpoint: string, satoshis: number, record: any, beef: number[] }): PledgeCandidate => {
  const sourceTx = Transaction.fromAtomicBEEF(p.beef)
  return { outpoint: p.outpoint, satoshis: p.satoshis, record: p.record, sourceTx, lockingScriptHex: sourceTx.outputs[parseOutpoint(p.outpoint).vout].lockingScript.toHex() }
}
async function startGuard (wallet: Wallet): Promise<string> {
  const g = await Guard.create({ wallet, fetchTx, log: l => logs.push(l) })
  const s = createGuardApp(g, wallet).listen(0)
  servers.push(s)
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`
}
const refusal = async (p: Promise<unknown>): Promise<{ status: number, reason: string }> => {
  try { await p } catch (e) { if (e instanceof CosignRejected) return { status: e.status, reason: e.reason }; throw e }
  throw new Error('expected the guard to refuse')
}

beforeAll(async () => {
  chain = await createMockChain()
  overlay = await startOverlay({ port: 18795, dbFile: join(mkdtempSync(join(tmpdir(), 'agentcoop-glh-')), 'overlay.db'), chainTracker: chain.chainTracker, quiet: true })
}, 60_000)
afterAll(async () => { for (const s of servers) s.close(); await overlay?.close(); await chain?.close() })

describe('guard kind lighthouse (D-P2c)', () => {
  let provider: Wallet, agent: Wallet, human1: Wallet, human2: Wallet, guardWallet: Wallet, otherGuardWallet: Wallet
  let guardUrl: string, otherGuardUrl: string
  let terms: PoolTerms
  let offer: Offer
  let aPledge: Awaited<ReturnType<typeof buildPledge>>
  let h1: LighthousePledge, h2: LighthousePledge
  let plan: SettlementPlan
  const at = (p: { outpoint: string }): number => 1 + plan.participants.findIndex(x => x.outpoint === p.outpoint)

  it('setup: a pool, two humans pledge once naming the guard and go offline, an agent pledges as usual', async () => {
    ;[provider, agent, human1, human2, guardWallet, otherGuardWallet] = await Promise.all(Array.from({ length: 6 }, async () => await chain.makeWallet()))
    for (const w of [provider, agent, human1, human2]) await chain.fund(w)
    guardUrl = await startGuard(guardWallet)
    otherGuardUrl = await startGuard(otherGuardWallet)
    const kitP = kitFor(provider)
    const height = await chain.services.getHeight()
    const { tokenId } = await kitP.deploy({ sym: 'GLH', amt: 1000n, dec: 0 })
    const reserved = await buildReserveAndAnnounce(provider, kitP, {
      v: '1', providerApi: 'http://localhost:8092', tokenId, credits: '1000', priceSats: '10000', feeSats: '50',
      minCredits: '100', deadlineHeight: String(height + 144), label: 'guard lighthouse', retailSatsPerCredit: '15'
    })
    terms = reserved.terms
    offer = await signOffer(provider, terms.poolId, terms)
    h1 = await buildLighthousePledge(human1, terms, '300', { tokenIndex: 0, guard: guardWallet.identityKey })
    h2 = await buildLighthousePledge(human2, terms, '200', { tokenIndex: 0, guard: guardWallet.identityKey })
    aPledge = await buildPledge(agent, terms, '500', 'p2pkh', undefined, { tokenIndex: 0 })
    plan = planSettlement(offer, [candidate(h1), candidate(aPledge), candidate(h2)], { height, satsPerKb: 100, offerSourceTx: Transaction.fromAtomicBEEF(reserved.beef) })
    expect(plan.participants.filter(p => p.mode === 'lighthouse')).toHaveLength(2)
  })

  it('refusals: a plan paying the human\'s credits elsewhere, a guard the human did not name, a malformed request', async () => {
    const tx = planTransaction(plan)
    tx.outputs[at(h1)].lockingScript = buildBsv21Script({ op: 'transfer', id: terms.tokenId, amt: '300' }, receivePkh(agent.identityKey, 99))
    const tampered: SettlementPlan = { ...plan, templateBEEF: tx.toAtomicBEEF() }
    expect(await refusal(lighthouseCosign(guardUrl, { plan: tampered, inputIndex: at(h1), pledge: h1 }))).toMatchObject({ status: 403, reason: expect.stringMatching(/does not pay the lighthouse pledger/) })
    expect(await refusal(lighthouseCosign(otherGuardUrl, { plan, inputIndex: at(h1), pledge: h1 }))).toMatchObject({ status: 403, reason: expect.stringMatching(/names another guard/) })
    expect(await refusal(lighthouseCosign(guardUrl, { plan, inputIndex: at(h2), pledge: h1 }))).toMatchObject({ status: 403, reason: expect.stringMatching(/is not/) })
    expect(await refusal(lighthouseCosign(guardUrl, { plan, inputIndex: at(h1), pledge: { outpoint: h1.outpoint } }))).toMatchObject({ status: 400 })
    expect(logs.filter(l => /DENY lighthouse/.test(l))).toHaveLength(4)
  })

  it('the guard co-signs both humans over HTTP; the agent signs; one settlement verifies and pays everyone', async () => {
    const sigs: Record<number, UnlockingScript> = {}
    sigs[at(aPledge)] = await signSettlementInput(plan, at(aPledge), new P2pkhWalletSigner(agent, { protocolID: aPledge.instructions.protocolID, keyID: aPledge.instructions.keyID }))
    for (const h of [h1, h2]) sigs[at(h)] = UnlockingScript.fromHex(await lighthouseCosign(guardUrl, { plan, inputIndex: at(h), pledge: h }))
    expect(logs.filter(l => /ALLOW lighthouse .* credits=(300|200)/.test(l))).toHaveLength(2)
    const settlement = assembleSettlement(plan, sigs)
    expect(await settlement.verify('scripts only')).toBe(true)
    await internalizeSettlement(agent, settlement, plan, aPledge.outpoint, aPledge.instructions) // broadcasts on the mock chain
    const onChain = await fetchTx(settlement.id('hex'))
    expect(onChain.outputs[0].satoshis).toBe(10_000)
    expect(onChain.outputs[at(h1)].lockingScript.toHex()).toBe(h1.creditLockingScriptHex)
    expect(onChain.outputs[at(h2)].lockingScript.toHex()).toBe(h2.creditLockingScriptHex)
  })
})
