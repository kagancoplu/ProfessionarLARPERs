/**
 * Track A 3.4, offline: credits bought in a pool settlement go back on the
 * market. Agent 1 lists part of its share, agent 3 (not in the pool) sweeps it
 * in one transaction, and verifyLineage walks the credits back through the
 * settlement and the provider's reservation to the deploy, without the overlay.
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
  TokenKit,
  assembleSettlement,
  buildPledge,
  buildReserveAndAnnounce,
  buildSweep,
  internalizeSettlement,
  parseOutpoint,
  planSettlement,
  reserveListing,
  signListing,
  signOffer,
  signSettlementInput,
  verifyLineage,
  verifyListing,
  type Listing,
  type PledgeCandidate
} from '@agentcoop/core'
import { startOverlay, type RunningOverlay } from '../docs/starter/bsv21-token-kit/overlay/server'
import { createMockChain, type MockChain } from './helpers/mockchain'

let chain: MockChain
let overlay: RunningOverlay
const beefs = new Map<string, number[]>()

beforeAll(async () => {
  chain = await createMockChain()
  overlay = await startOverlay({ port: 18193, dbFile: join(mkdtempSync(join(tmpdir(), 'agentcoop-e2e-mkt-')), 'overlay.db'), chainTracker: chain.chainTracker, quiet: true })
})
afterAll(async () => { await overlay?.close(); await chain?.close() })

const fetchTx = async (txid: string): Promise<Transaction> =>
  Transaction.fromBinary(Array.from((await (chain.services as any).storage.getTransaction(txid)).rawTx as number[]))
const getBeef = async (txid: string): Promise<number[]> => { const b = beefs.get(txid); if (b === undefined) throw new Error(`no BEEF for ${txid}`); return b }

type Pledged = Awaited<ReturnType<typeof buildPledge>>
const candidate = (p: Pledged): PledgeCandidate => {
  const sourceTx = Transaction.fromAtomicBEEF(p.beef)
  return { outpoint: p.outpoint, satoshis: p.satoshis, lockingScriptHex: sourceTx.outputs[parseOutpoint(p.outpoint).vout].lockingScript.toHex(), record: p.record, sourceTx }
}

describe('e2e market: settled credits are resold in one sweep', () => {
  let provider: Wallet, agent1: Wallet, agent2: Wallet, agent3: Wallet
  let kitP: TokenKit, kit1: TokenKit, kit2: TokenKit, kit3: TokenKit
  let tokenId: string
  let settlement: Transaction
  let listing: Listing

  it('a pool of 1,000 credits settles 600 / 400', async () => {
    ;[provider, agent1, agent2, agent3] = await Promise.all([0, 1, 2, 3].map(async () => await chain.makeWallet()))
    for (const w of [provider, agent1, agent2, agent3]) await chain.fund(w)
    ;[kitP, kit1, kit2, kit3] = [provider, agent1, agent2, agent3].map(w => new TokenKit(w, new OverlayClient(overlay.url)))
    const height = await chain.services.getHeight()
    ;({ tokenId } = await kitP.deploy({ sym: 'RESALE', amt: 1000n, dec: 0 }))
    const reserved = await buildReserveAndAnnounce(provider, kitP, {
      v: '1', providerApi: 'http://localhost:8092', tokenId, credits: '1000', priceSats: '10000', feeSats: '50',
      minCredits: '100', deadlineHeight: String(height + 144), label: 'resale test', retailSatsPerCredit: '15'
    })
    const offer = await signOffer(provider, reserved.terms.poolId, reserved.terms)
    const p1 = await buildPledge(agent1, reserved.terms, '600', 'p2pkh', undefined, { tokenIndex: await kit1.nextIndex(await kit1.identityKey()) })
    const p2 = await buildPledge(agent2, reserved.terms, '400', 'p2pkh', undefined, { tokenIndex: await kit2.nextIndex(await kit2.identityKey()) })
    const plan = planSettlement(offer, [candidate(p1), candidate(p2)], { height, satsPerKb: 100, offerSourceTx: Transaction.fromAtomicBEEF(reserved.beef) })

    const sigs: Record<number, any> = {}
    for (const [p, w] of [[p1, agent1], [p2, agent2]] as const) {
      const i = plan.participants.findIndex(x => x.outpoint === p.outpoint) + 1
      sigs[i] = await signSettlementInput(plan, i, new P2pkhWalletSigner(w, { protocolID: p.instructions.protocolID, keyID: p.instructions.keyID }))
    }
    settlement = assembleSettlement(plan, sigs)
    await internalizeSettlement(agent1, settlement, plan, p1.outpoint, p1.instructions)
    await internalizeSettlement(agent2, settlement, plan, p2.outpoint, p2.instructions)
    await kitP.overlay.submit(settlement.toAtomicBEEF())
    await kit1.sync(); await kit2.sync()
    expect((await kit1.balances()).find(b => b.tokenId === tokenId)).toMatchObject({ overlay: 600n, basket: 600n })
  })

  it('agent 1 lists 250 of its settled credits; the listing verifies offline', async () => {
    const r = await reserveListing(agent1, kit1, tokenId, '250', '3000')
    beefs.set(r.txid, r.beef)
    const listingTx = Transaction.fromAtomicBEEF(r.beef)
    // The listing spends the settlement's credit output, not a fresh mint.
    expect(listingTx.inputs.some(i => (i.sourceTXID ?? i.sourceTransaction?.id('hex')) === settlement.id('hex'))).toBe(true)
    listing = await signListing(agent1, r.outpoint, '3000')
    verifyListing(listing, { sourceTx: listingTx })
    expect((await kit1.balances()).find(b => b.tokenId === tokenId)?.overlay).toBe(350n)
  })

  it('agent 3 sweeps it; lineage runs listing → settlement → reservation → deploy', async () => {
    const before = await verifyLineage(listing.outpoint, { fetchTx })
    expect(before).toMatchObject({ ok: true, tokenId, amt: 250n })
    expect(before.depth).toBeGreaterThanOrEqual(3)

    const { txid, credits, tx } = await buildSweep(agent3, kit3, [listing], { lineage: { fetchTx }, getBeef })
    expect(credits).toBe('250')
    expect(tx.outputs[0].satoshis).toBe(3000)
    expect(tx.outputs[0].lockingScript.toHex()).toBe(listing.payScriptHex)
    await kit3.sync()
    expect((await kit3.balances()).find(b => b.tokenId === tokenId)).toMatchObject({ overlay: 250n, basket: 250n })

    const after = await verifyLineage(`${txid}_1`, { fetchTx }) // out0 pays the seller, out1 the bought credits

    expect(after).toMatchObject({ ok: true, tokenId, amt: 250n })
    expect(after.depth).toBeGreaterThan(before.depth)
  })

  it('the same listing cannot be swept twice', async () => {
    const agent4 = await chain.makeWallet(); await chain.fund(agent4)
    const kit4 = new TokenKit(agent4, new OverlayClient(overlay.url))
    await expect(buildSweep(agent4, kit4, [listing], { lineage: { fetchTx }, getBeef })).rejects.toThrow()
    await kit4.sync()
    expect((await kit4.balances()).find(b => b.tokenId === tokenId)?.overlay ?? 0n).toBe(0n)
  })
})
