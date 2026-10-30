/**
 * B-INT §2.5: the whole pool flow with Track A's real builders, through
 * Track B's tm_agentcoop overlay and the coordinator's signing round.
 * Validation test 1 repeated with A's transactions, and the mock-chain
 * equivalent of S1 (walking skeleton).
 *
 *   provider: TokenKit.deploy → buildReserveAndAnnounce → signOffer → POST /offers
 *   agents:   buildPledge (600 / 400) → overlay
 *   coordinator: lock-in → planSettlement (A) → sign_request over WS
 *   agents:   verifySettlementPlan (+ verifyLineage) → signSettlementInput → sign_response
 *   coordinator: assembleSettlement → broadcast → overlay → settled
 *   agents:   internalizeSettlement + TokenKit.sync → 600 / 400 credits
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Transaction } from '@agentcoop/core/sdk'
import type { Wallet } from '@bsv/wallet-toolbox'
import { buildPledge, buildReserveAndAnnounce, COOP_SERVICE, COOP_TOPIC, internalizeSettlement, OverlayClient, signOffer, TokenKit, type PoolTerms } from '@agentcoop/core'
import { startOverlay, type RunningOverlay } from '../../../packages/overlay/src/server'
import { createMockChain, type MockChain } from '../../../test/helpers/mockchain'
import { broadcastMock, lookup } from '../../../packages/overlay/test/helpers/settlement'
import { ManualHeight } from '../src/chain'
import { coreProtocol } from '../src/protocol'
import { noSpentChecker } from '../src/spent'
import { startCoordinator, type RunningCoordinator } from '../src/server'
import { startAgentBot, type AgentBot } from './helpers/agentBot'

let chain: MockChain
let overlay: RunningOverlay
let coop: RunningCoordinator
const logs: any[] = []

const kitFor = (w: Wallet): TokenKit => new TokenKit(w, new OverlayClient(overlay.url, undefined, 'main', undefined, COOP_TOPIC, COOP_SERVICE))
const fetchTx = async (txid: string): Promise<Transaction> =>
  Transaction.fromBinary(Array.from((await (chain.services as any).storage.getTransaction(txid)).rawTx as number[]))

const agentBot = async (w: Wallet, kit: TokenKit, pledge: Awaited<ReturnType<typeof buildPledge>>): Promise<AgentBot> =>
  await startAgentBot(coop.url, w, await kit.identityKey(), pledge, fetchTx)

const waitFor = async <T>(fn: () => T | undefined, ms = 30_000): Promise<T> => {
  const end = Date.now() + ms
  for (;;) {
    const v = fn()
    if (v !== undefined) return v
    if (Date.now() > end) throw new Error('timed out')
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

beforeAll(async () => {
  chain = await createMockChain()
  const dir = mkdtempSync(join(tmpdir(), 'agentcoop-int-'))
  overlay = await startOverlay({ port: 18690, dbFile: join(dir, 'overlay.db'), chainTracker: chain.chainTracker, quiet: true })
  const height = await chain.services.getHeight()
  coop = await startCoordinator(
    { port: 18691, overlayUrl: overlay.url, arcadeUrl: 'http://unused.invalid', dbFile: join(dir, 'coordinator.db'), pollMs: 1_000, roundTimeoutMs: 20_000, maxRounds: 3, spentCheck: 'none', network: 'main' },
    {
      height: new ManualHeight(height),
      protocol: coreProtocol({ arcadeUrl: 'http://unused.invalid', policy: async () => ({ height, satsPerKb: 100 }), broadcast: async tx => { await broadcastMock(chain.services, tx); return tx.id('hex') } }),
      spent: noSpentChecker,
      log: (event, f) => { logs.push({ event, ...f }) }
    }
  )
})

afterAll(async () => {
  await coop?.close()
  await overlay?.close()
  await chain?.close()
})

describe('Track A builders × Track B overlay and coordinator', () => {
  let provider: Wallet, agent1: Wallet, agent2: Wallet
  let kitP: TokenKit, kit1: TokenKit, kit2: TokenKit
  let terms: PoolTerms

  it('provider: deploy, reserve + announce (T1, T2) on tm_agentcoop, offer accepted by the coordinator', async () => {
    ;[provider, agent1, agent2] = await Promise.all([chain.makeWallet(), chain.makeWallet(), chain.makeWallet()])
    for (const w of [provider, agent1, agent2]) await chain.fund(w)
    ;[kitP, kit1, kit2] = [kitFor(provider), kitFor(agent1), kitFor(agent2)]
    const height = await chain.services.getHeight()
    const { tokenId } = await kitP.deploy({ sym: 'H100MIN', amt: 1000n, dec: 0 })
    const reserved = await buildReserveAndAnnounce(provider, kitP, {
      v: '1', providerApi: 'http://localhost:8092', tokenId, credits: '1000', priceSats: '10000', feeSats: '50',
      minCredits: '100', deadlineHeight: String(height + 144), label: '8×H100 · 1 week', retailSatsPerCredit: '15'
    })
    terms = reserved.terms
    const pool = (await lookup(overlay.url, { op: 'pool', poolId: terms.poolId }))[0]?.ctx
    expect(pool).toMatchObject({ poolId: terms.poolId, status: 'open', target: '1000', pledgedCredits: '0' })
    expect(pool.invalidReason).toBeUndefined()

    const offer = await signOffer(provider, terms.poolId, terms)
    const res = await fetch(`${coop.url}/offers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(offer) })
    expect(res.status).toBe(201)
  })

  it('agents pledge with buildPledge; the coordinator runs the round with A\'s planSettlement; credits arrive (T3, T5)', async () => {
    const p1 = await buildPledge(agent1, terms, '600', 'p2pkh', undefined, { tokenIndex: await kit1.nextIndex(await kit1.identityKey()) })
    const p2 = await buildPledge(agent2, terms, '400', 'p2pkh', undefined, { tokenIndex: await kit2.nextIndex(await kit2.identityKey()) })
    const bots = [await agentBot(agent1, kit1, p1), await agentBot(agent2, kit2, p2)]
    for (const p of [p1, p2]) await kit1.overlay.submit(p.beef) // what the agent's app does after buildPledge

    const settled = await waitFor(() => bots[0].messages.find(m => m.type === 'settled' && m.poolId === terms.poolId))
    const view = await (await fetch(`${coop.url}/pools/${terms.poolId}`)).json()
    expect(view).toMatchObject({ status: 'settled', settledTxid: settled.txid, pledgedCredits: '1000', coordinator: { lastRound: { round: 1, outcome: 'settled' } } })
    expect(logs.some(l => l.event === 'sign_reject')).toBe(false)

    // The settle record is A's (termsHash, round) and counts for the overlay.
    const [s] = await lookup(overlay.url, { op: 'settlement', poolId: terms.poolId })
    expect(s.ctx).toMatchObject({ poolId: terms.poolId, txid: settled.txid, pledgeListHash: bots[0].plans[0].pledgeListHash })

    // Agents take their change back and sync their credits.
    const settlement = await settlementTx(terms.poolId, settled.txid)
    await internalizeSettlement(agent1, settlement, bots[0].plans[0], p1.outpoint, p1.instructions)
    await internalizeSettlement(agent2, settlement, bots[1].plans[0], p2.outpoint, p2.instructions)
    await kit1.sync(); await kit2.sync()
    expect((await kit1.balances()).find(b => b.tokenId === terms.tokenId)).toMatchObject({ overlay: 600n, basket: 600n })
    expect((await kit2.balances()).find(b => b.tokenId === terms.tokenId)).toMatchObject({ overlay: 400n, basket: 400n })
    expect(settlement.outputs[0]).toMatchObject({ satoshis: 10000 })
    expect(settlement.outputs[0].lockingScript.toHex()).toBe(terms.payScriptHex)
    for (const b of bots) b.ws.close()
  })
})

/** The settlement as the overlay serves it: BEEF with its ancestry, so input sources are linked. */
async function settlementTx (poolId: string, txid: string): Promise<Transaction> {
  const res = await fetch(`${overlay.url}/lookup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service: 'ls_agentcoop', query: { op: 'settlement', poolId } })
  })
  const answer = await res.json() as { outputs: Array<{ beef: number[] }> }
  return Transaction.fromBEEF(answer.outputs[0].beef, txid)
}
