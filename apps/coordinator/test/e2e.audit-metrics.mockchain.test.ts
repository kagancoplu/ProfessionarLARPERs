/**
 * B.P6a (plan/phases/B-P6a.md §6): GET /pools/:id/audit and GET /metrics,
 * with Track A's builders, the tm_agentcoop overlay and the coordinator.
 * Pledges are mined one per block so the (height, txid) order is fixed.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { P2PKH, PrivateKey, Transaction, type MerklePath } from '@agentcoop/core/sdk'
import type { Wallet } from '@bsv/wallet-toolbox'
import {
  assembleSettlement, buildPledge, buildReserveAndAnnounce, COOP_SERVICE, COOP_TOPIC, OverlayClient, P2pkhWalletSigner, planSettlement,
  signOffer, signSettlementInput, TokenKit, type Offer, type PledgeCandidate, type PoolTerms
} from '@agentcoop/core'
import { startOverlay, type RunningOverlay } from '../../../packages/overlay/src/server'
import { createMockChain, type MockChain } from '../../../test/helpers/mockchain'
import { broadcastMock, submitToOverlay } from '../../../packages/overlay/test/helpers/settlement'
import { ManualHeight } from '../src/chain'
import { classifySettlement } from '../src/metrics'
import { coreCandidate } from '../src/candidates'
import { coreProtocol } from '../src/protocol'
import { noSpentChecker } from '../src/spent'
import { startCoordinator, type RunningCoordinator } from '../src/server'
import { startAgentBot, type AgentBot } from './helpers/agentBot'

let chain: MockChain
let overlay: RunningOverlay
let coop: RunningCoordinator
const bots: AgentBot[] = []
const w: Record<'provider' | 'silent' | 'a1' | 'a2' | 'a3', Wallet> = {} as any
const kit: Record<keyof typeof w, TokenKit> = {} as any

type Pledged = Awaited<ReturnType<typeof buildPledge>>
const fetchTx = async (txid: string): Promise<Transaction> =>
  Transaction.fromBinary(Array.from((await (chain.services as any).storage.getTransaction(txid)).rawTx as number[]))
const get = async (path: string): Promise<{ status: number, body: any }> => {
  const res = await fetch(`${coop.url}${path}`)
  return { status: res.status, body: res.headers.get('content-type')?.includes('json') === true ? await res.json() : await res.text() }
}
const waitFor = async <T>(fn: () => T | undefined, ms = 40_000): Promise<T> => {
  const end = Date.now() + ms
  for (;;) {
    const v = fn()
    if (v !== undefined) return v
    if (Date.now() > end) throw new Error('timed out')
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

async function openPool (credits = '1000'): Promise<{ terms: PoolTerms, offer: Offer }> {
  const height = await chain.services.getHeight()
  const { tokenId } = await kit.provider.deploy({ sym: 'H100MIN', amt: BigInt(credits), dec: 0 })
  const { terms } = await buildReserveAndAnnounce(w.provider, kit.provider, {
    v: '1', providerApi: 'http://localhost:8092', tokenId, credits, priceSats: '10000', feeSats: '50',
    minCredits: '100', deadlineHeight: String(height + 144), label: '8×H100 · 1 week', retailSatsPerCredit: '15'
  })
  return { terms, offer: await signOffer(w.provider, terms.poolId, terms) }
}

/** buildPledge, mined in its own block, submitted with its merkle path (the overlay records its height). */
async function pledgeMined (name: keyof typeof w, terms: PoolTerms, credits: string): Promise<{ p: Pledged, sourceTx: Transaction }> {
  // allowMultiple: these test agents skip internalizeSettlement, so their wallets still list the earlier (spent) pledge coin.
  const p = await buildPledge(w[name], terms, credits, 'p2pkh', undefined, { tokenIndex: await kit[name].nextIndex(await kit[name].identityKey()), allowMultiple: true })
  await chain.mineBlock()
  const sourceTx = Transaction.fromAtomicBEEF(p.beef)
  sourceTx.merklePath = (await chain.services.getMerklePath(p.txid)).merklePath as MerklePath
  expect((await submitToOverlay(overlay.url, sourceTx.toBEEF())).status).toBe(200)
  return { p, sourceTx }
}

beforeAll(async () => {
  chain = await createMockChain()
  const dir = mkdtempSync(join(tmpdir(), 'agentcoop-audit-'))
  overlay = await startOverlay({ port: 18790, dbFile: join(dir, 'overlay.db'), chainTracker: chain.chainTracker, quiet: true })
  const height = await chain.services.getHeight()
  coop = await startCoordinator(
    { port: 18791, overlayUrl: overlay.url, arcadeUrl: 'http://unused.invalid', dbFile: join(dir, 'coordinator.db'), pollMs: 500, roundTimeoutMs: 3_000, maxRounds: 3, spentCheck: 'none', network: 'main' },
    {
      height: new ManualHeight(height),
      protocol: coreProtocol({ arcadeUrl: 'http://unused.invalid', policy: async () => ({ height, satsPerKb: 100 }), broadcast: async tx => { await broadcastMock(chain.services, tx); return tx.id('hex') } }),
      spent: noSpentChecker,
      log: () => {}
    }
  )
  for (const name of ['provider', 'silent', 'a1', 'a2', 'a3'] as const) {
    w[name] = await chain.makeWallet()
    await chain.fund(w[name])
    kit[name] = new TokenKit(w[name], new OverlayClient(overlay.url, undefined, 'main', undefined, COOP_TOPIC, COOP_SERVICE))
  }
})

afterAll(async () => {
  for (const b of bots) b.ws.close()
  await coop?.close()
  await overlay?.close()
  await chain?.close()
})

describe('audit and metrics', () => {
  let p1: PoolTerms
  let silentPledge: Pledged

  it('1. a coordinator-run settlement with a waiting-list round audits as consistent; the skipped pledge shows its declared reason', async () => {
    const pool = await openPool()
    p1 = pool.terms
    const s = await pledgeMined('silent', p1, '400') // first in line, never signs
    silentPledge = s.p
    const x1 = await pledgeMined('a1', p1, '600')
    const x2 = await pledgeMined('a2', p1, '400')
    bots.push(await startAgentBot(coop.url, w.silent, await kit.silent.identityKey(), s.p, fetchTx, { silent: true }))
    bots.push(await startAgentBot(coop.url, w.a1, await kit.a1.identityKey(), x1.p, fetchTx))
    bots.push(await startAgentBot(coop.url, w.a2, await kit.a2.identityKey(), x2.p, fetchTx))
    expect((await fetch(`${coop.url}/offers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pool.offer) })).status).toBe(201)
    await waitFor(() => bots[1].messages.find(m => m.type === 'settled' && m.poolId === p1.poolId))

    const { status, body: audit } = await get(`/pools/${p1.poolId}/audit`)
    expect(status).toBe(200)
    expect(audit.checks).toEqual({ hashMatches: true, termsHashMatches: true, providerPaid: true, creditsDelivered: true, allIncludedValid: true, selectionMatches: true })
    expect(audit.included.map((x: any) => x.outpoint).sort()).toEqual([x1.p.outpoint, x2.p.outpoint].sort())
    expect(audit.skippedEarlier).toEqual([{ outpoint: s.p.outpoint, participant: await kit.silent.identityKey(), credits: '400', reason: 'timeout' }])
    expect(audit.settlement.round).toBe('2')
    expect(audit.verdict).toBe('consistent')
  })

  it('2. a settlement that skips the first pledge with no declared reason is flagged', async () => {
    const pool = await openPool()
    const first = await pledgeMined('a3', pool.terms, '500')
    const others = [await pledgeMined('a1', pool.terms, '500'), await pledgeMined('a2', pool.terms, '500')]
    // A rogue coordinator: plans outside our coordinator and leaves `first` out without telling anyone.
    const candidate = (x: { p: Pledged, sourceTx: Transaction }): PledgeCandidate => ({
      outpoint: x.p.outpoint, satoshis: x.p.satoshis, lockingScriptHex: x.sourceTx.outputs[Number(x.p.outpoint.split('_')[1])].lockingScript.toHex(),
      record: x.p.record, sourceTx: x.sourceTx, blockHeight: x.sourceTx.merklePath!.blockHeight
    })
    const poolTx = await fetchTx(pool.terms.poolId.split('_')[0])
    const plan = planSettlement(pool.offer, [first, ...others].map(candidate), { height: await chain.services.getHeight(), satsPerKb: 100, offerSourceTx: (await coop.deps.overlay.poolTx(pool.terms.poolId)) ?? poolTx }, { exclude: [first.p.outpoint] })
    const sigs: Record<number, any> = {}
    for (const [x, name] of [[others[0], 'a1'], [others[1], 'a2']] as const) {
      const i = plan.participants.findIndex(q => q.outpoint === x.p.outpoint) + 1
      sigs[i] = await signSettlementInput(plan, i, new P2pkhWalletSigner(w[name], { protocolID: x.p.instructions.protocolID, keyID: x.p.instructions.keyID }))
    }
    const tx = assembleSettlement(plan, sigs)
    await broadcastMock(chain.services, tx)
    expect((await submitToOverlay(overlay.url, tx.toBEEF())).status).toBe(200)
    await coop.deps.store.saveOffer(pool.offer) // the audit re-runs the rule with the provider's offer

    const { body: audit } = await get(`/pools/${pool.terms.poolId}/audit`)
    expect(audit.checks).toMatchObject({ hashMatches: true, providerPaid: true, creditsDelivered: true, selectionMatches: false })
    expect(audit.skippedEarlier).toEqual([expect.objectContaining({ outpoint: first.p.outpoint, reason: 'not explained' })])
    expect(audit.expectedIncluded).toEqual([first.p.outpoint, others[0].p.outpoint])
    expect(audit.verdict).toBe('unexplained-skips')
  })

  it('3. /metrics counts settlements and participants and computes custodiedSats = 0', async () => {
    const { body: m } = await get('/metrics')
    expect(m).toMatchObject({ settlements: 2, participants: { total: 4, max: 2 }, custodiedSats: 0, custodyCheck: { settlementsChecked: 2, unaccountedOutputs: [] } })
    expect(m.pools.settled).toBe(2)
    expect(m.pledges).toMatchObject({ settled: 4, waiting: 2 }) // the silent 400 and the skipped 500
    expect(m.avgFeeSats).toBeGreaterThan(0)
    const prom = (await get('/metrics?format=prom')).body as string
    expect(prom).toContain('agentcoop_custodied_sats 0')
    expect(prom).toContain('agentcoop_settlements 2')
    expect((await get(`/pools/${p1.poolId}/audit`)).body.verdict).toBe('consistent')
  })

  it('4. an output paying anyone else is counted as custodied', async () => {
    const s = await coop.deps.overlay.settlementWithTx(p1.poolId)
    const all = await coop.deps.overlay.pledgeCandidatesAll(p1.poolId)
    const included = all.filter(c => c.view.spendingTxid === s!.tx.id('hex')).map(c => coreCandidate(c.view, c.sourceTx))
    expect(classifySettlement(s!.tx, p1, included)).not.toContain('unaccounted')
    const tampered = Transaction.fromBinary(s!.tx.toBinary())
    tampered.addOutput({ lockingScript: new P2PKH().lock(PrivateKey.fromRandom().toAddress()), satoshis: 500 })
    expect(classifySettlement(tampered, p1, included).at(-1)).toBe('unaccounted')
    void silentPledge
  })
})
