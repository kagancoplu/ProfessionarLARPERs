/**
 * B.P6b (Faz 6.1, 6.2): the coordinator is a permissionless role.
 *
 *  1. Coordinator 1 closes pool B; the provider also published the offer on chain.
 *  2. Coordinator 1 goes away. Coordinator 2 (own database, same overlay) audits
 *     pool B from the chain alone: the published offer gives the same termsHash.
 *  3. Pool A: the provider publishes its offer on chain only (after a bogus record
 *     for the same pool); nobody POSTs it anywhere. Coordinator 2 finds it, runs
 *     the round with the agents connected to it, and settles.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Wallet } from '@bsv/wallet-toolbox'
import { buildPledge, publishOffer, termsHash, type Offer, type PoolTerms } from '@agentcoop/core'
import { startOverlay, type RunningOverlay } from '../../../packages/overlay/src/server'
import { createMockChain, type MockChain } from '../../../test/helpers/mockchain'
import { broadcastMock, lookup } from '../../../packages/overlay/test/helpers/settlement'
import { ManualHeight } from '../src/chain'
import type { CoordinatorConfig } from '../src/config'
import { coreProtocol } from '../src/protocol'
import { noSpentChecker } from '../src/spent'
import { startCoordinator, type RunningCoordinator } from '../src/server'
import { startAgentBot, type AgentBot } from './helpers/agentBot'
import { fetchTxFrom, kitOn, openCoopPool, waitUntil } from './helpers/coopPool'

let chain: MockChain
let overlay: RunningOverlay
let coop1: RunningCoordinator | undefined
let coop2: RunningCoordinator | undefined
let dir: string
const logs: Record<string, any[]> = { c1: [], c2: [] }

async function startCoop (name: 'c1' | 'c2', port: number): Promise<RunningCoordinator> {
  const height = await chain.services.getHeight()
  const config: CoordinatorConfig = { port, overlayUrl: overlay.url, arcadeUrl: 'http://unused.invalid', dbFile: join(dir, `${name}.db`), pollMs: 500, roundTimeoutMs: 20_000, maxRounds: 3, spentCheck: 'none', network: 'main' }
  return await startCoordinator(config, {
    height: new ManualHeight(height),
    protocol: coreProtocol({ arcadeUrl: 'http://unused.invalid', policy: async () => ({ height, satsPerKb: 100 }), broadcast: async tx => { await broadcastMock(chain.services, tx); return tx.id('hex') } }),
    spent: noSpentChecker,
    log: (event, f) => { logs[name].push({ event, ...f }) }
  })
}

async function pledgeAndBots (coopUrl: string, terms: PoolTerms, wallets: Wallet[], credits: string[]): Promise<AgentBot[]> {
  const bots: AgentBot[] = []
  const beefs: number[][] = []
  for (const [i, w] of wallets.entries()) {
    const kit = kitOn(overlay.url, w)
    const me = await kit.identityKey()
    const p = await buildPledge(w, terms, credits[i], 'p2pkh', undefined, { tokenIndex: await kit.nextIndex(me) })
    bots.push(await startAgentBot(coopUrl, w, me, p, fetchTxFrom(chain)))
    beefs.push(p.beef)
  }
  for (const b of beefs) await kitOn(overlay.url, wallets[0]).overlay.submit(b)
  return bots
}

beforeAll(async () => {
  chain = await createMockChain()
  dir = mkdtempSync(join(tmpdir(), 'agentcoop-c2-'))
  overlay = await startOverlay({ port: 18890, dbFile: join(dir, 'overlay.db'), chainTracker: chain.chainTracker, quiet: true })
  coop1 = await startCoop('c1', 18891)
})

afterAll(async () => {
  await coop1?.close()
  await coop2?.close()
  await overlay?.close()
  await chain?.close()
})

describe('a second, independent coordinator', () => {
  let provider: Wallet, a1: Wallet, a2: Wallet, a3: Wallet
  let poolB: { terms: PoolTerms, offer: Offer }
  let settledB: string

  it('coordinator 1 closes pool B (offer posted to it and published on chain)', async () => {
    ;[provider, a1, a2, a3] = await Promise.all([chain.makeWallet(), chain.makeWallet(), chain.makeWallet(), chain.makeWallet()])
    for (const w of [provider, a1, a2, a3]) await chain.fund(w)
    poolB = await openCoopPool(chain, overlay.url, provider, { credits: 500, priceSats: 5_000, sym: 'POOLB' })
    expect((await fetch(`${coop1!.url}/offers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(poolB.offer) })).status).toBe(201)
    const pub = await publishOffer(provider, poolB.offer)
    await kitOn(overlay.url, provider).overlay.submit(pub.beef)
    const offers = await lookup(overlay.url, { op: 'offers', poolId: poolB.terms.poolId })
    expect(offers.map((o: any) => o.ctx)).toEqual([{ txid: pub.txid, v: '1', poolId: poolB.terms.poolId, unlockingScriptHex: poolB.offer.unlockingScriptHex }])

    const bots = await pledgeAndBots(coop1!.url, poolB.terms, [a1, a2], ['300', '200'])
    const settled = await waitUntil(() => bots[0].messages.find(m => m.type === 'settled' && m.poolId === poolB.terms.poolId), 30_000, 'pool B settled')
    settledB = settled.txid
    expect(logs.c1.some(l => l.event === 'settled' && l.poolId === poolB.terms.poolId)).toBe(true)
    for (const b of bots) b.ws.close()
  })

  it('coordinator 1 goes away; coordinator 2 audits pool B from the chain alone', async () => {
    await coop1!.close()
    coop1 = undefined
    coop2 = await startCoop('c2', 18892)
    const audit = await (await fetch(`${coop2.url}/pools/${poolB.terms.poolId}/audit`)).json()
    expect(audit.settlement.txid).toBe(settledB)
    expect(audit.checks).toMatchObject({ hashMatches: true, termsHashMatches: true, providerPaid: true, creditsDelivered: true, allIncludedValid: true, selectionMatches: true })
    expect(audit.verdict).toBe('consistent')
    // the offer coordinator 2 rebuilt from the chain is the provider's, byte for byte
    expect(await (await fetch(`${coop2.url}/offers/${poolB.terms.poolId}`)).json()).toEqual(poolB.offer)
    expect(termsHash((await (await fetch(`${coop2.url}/offers/${poolB.terms.poolId}`)).json()).terms)).toBe(termsHash(poolB.offer.terms))
  })

  it('pool A: the offer exists only on chain (after a bogus record); coordinator 2 finds it and settles', async () => {
    const poolA = await openCoopPool(chain, overlay.url, provider, { credits: 600, priceSats: 6_000, sym: 'POOLA' })
    // Someone publishes a bogus offer for pool A first (a valid-looking but wrong signature).
    const bogus: Offer = { ...poolA.offer, unlockingScriptHex: poolB.offer.unlockingScriptHex }
    await kitOn(overlay.url, a3).overlay.submit((await publishOffer(a3, bogus)).beef)
    const real = await publishOffer(provider, poolA.offer)
    await kitOn(overlay.url, provider).overlay.submit(real.beef)
    expect(await lookup(overlay.url, { op: 'offers', poolId: poolA.terms.poolId })).toHaveLength(2)

    // Nobody POSTed the offer; coordinator 2 picks the valid one from the chain.
    const pool = await waitUntil(async () => {
      const p = await (await fetch(`${coop2!.url}/pools/${poolA.terms.poolId}`)).json()
      return p.hasOffer === true ? p : undefined
    }, 20_000, 'hasOffer at coordinator 2')
    expect(pool.status).toBe('open')
    expect(await (await fetch(`${coop2!.url}/offers/${poolA.terms.poolId}`)).json()).toEqual(poolA.offer)

    // fresh agents (a1/a2 still hold pool B's pledge in their basket until they internalize the settlement)
    const agents = await Promise.all([chain.makeWallet(), chain.makeWallet(), chain.makeWallet()])
    for (const w of agents) await chain.fund(w)
    const bots = await pledgeAndBots(coop2!.url, poolA.terms, agents, ['100', '200', '300'])
    const settled = await waitUntil(() => bots[0].messages.find(m => m.type === 'settled' && m.poolId === poolA.terms.poolId), 30_000, 'pool A settled')
    expect(logs.c2.find(l => l.event === 'settled' && l.poolId === poolA.terms.poolId)).toMatchObject({ txid: settled.txid, participants: 3 })
    const audit = await (await fetch(`${coop2!.url}/pools/${poolA.terms.poolId}/audit`)).json()
    expect(audit.verdict).toBe('consistent')
    const metrics = await (await fetch(`${coop2!.url}/metrics`)).json()
    expect(metrics.custodiedSats).toBe(0)
    expect(metrics.settlements).toBe(2) // pool B (coordinator 1) and pool A (coordinator 2), both from the chain
    for (const b of bots) b.ws.close()
  })
})
