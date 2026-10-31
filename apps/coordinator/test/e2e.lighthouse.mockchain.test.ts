/**
 * B-A5 (plan/phases/B-A5.md): lighthouse pledges through the coordinator.
 * Two humans pledge once (A's buildLighthousePledge), POST it to the
 * coordinator and go offline; one agent pledges as usual and stays on WS.
 * In the round the coordinator asks the humans' guard (D's guard, POST
 * /cosign kind 'lighthouse') instead of the humans; one settlement pays
 * everyone. A lighthouse pledge the coordinator was never given is left out
 * of the plan (nobody could sign it); a pledge with a bad signature or an
 * unreachable guard is refused at POST. A pledge already on the overlay can be
 * posted without its beef (the web app does that).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrivateKey, Transaction, Utils } from '@agentcoop/core/sdk'
import type { Wallet } from '@bsv/wallet-toolbox'
import {
  buildLighthousePledge, buildPledge, buildReserveAndAnnounce, COOP_SERVICE, COOP_TOPIC, OverlayClient, signOffer, TokenKit,
  type LighthousePledge, type PoolTerms
} from '@agentcoop/core'
import { startOverlay, type RunningOverlay } from '../../../packages/overlay/src/server'
import { createMockChain, type MockChain } from '../../../test/helpers/mockchain'
import { broadcastMock } from '../../../packages/overlay/test/helpers/settlement'
import { Guard } from '../../guard/src/guard'
import { createGuardApp } from '../../guard/src/server'
import { ManualHeight } from '../src/chain'
import { coreProtocol } from '../src/protocol'
import { noSpentChecker } from '../src/spent'
import { startCoordinator, type RunningCoordinator } from '../src/server'
import { startAgentBot, type AgentBot } from './helpers/agentBot'
import { waitUntil } from './helpers/coopPool'

let chain: MockChain
let overlay: RunningOverlay
let coop: RunningCoordinator
let guardServer: Server
let guardUrl: string
const logs: any[] = []

const kitFor = (w: Wallet): TokenKit => new TokenKit(w, new OverlayClient(overlay.url, undefined, 'main', undefined, COOP_TOPIC, COOP_SERVICE))
const fetchTx = async (txid: string): Promise<Transaction> =>
  Transaction.fromBinary(Array.from((await (chain.services as any).storage.getTransaction(txid)).rawTx as number[]))
const post = async (path: string, body: unknown): Promise<{ status: number, body: any }> => {
  const res = await fetch(`${coop.url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { status: res.status, body: await res.json() }
}

let guardWallet: Wallet
beforeAll(async () => {
  chain = await createMockChain()
  const dir = mkdtempSync(join(tmpdir(), 'agentcoop-coop-lh-'))
  overlay = await startOverlay({ port: 18890, dbFile: join(dir, 'overlay.db'), chainTracker: chain.chainTracker, quiet: true })
  guardWallet = await chain.makeWallet()
  guardServer = createGuardApp(await Guard.create({ wallet: guardWallet, fetchTx, log: () => {} }), guardWallet).listen(0)
  guardUrl = `http://127.0.0.1:${(guardServer.address() as AddressInfo).port}`
  const height = await chain.services.getHeight()
  coop = await startCoordinator(
    { port: 18891, overlayUrl: overlay.url, arcadeUrl: 'http://unused.invalid', dbFile: join(dir, 'coordinator.db'), pollMs: 500, roundTimeoutMs: 20_000, maxRounds: 3, spentCheck: 'none', network: 'main', lighthouseGuards: [guardUrl] },
    {
      height: new ManualHeight(height),
      protocol: coreProtocol({ arcadeUrl: 'http://unused.invalid', policy: async () => ({ height, satsPerKb: 100 }), broadcast: async tx => { await broadcastMock(chain.services, tx); return tx.id('hex') } }),
      spent: noSpentChecker,
      log: (event, f) => { logs.push({ event, ...f }) }
    }
  )
}, 60_000)

afterAll(async () => {
  await coop?.close()
  guardServer?.close()
  await overlay?.close()
  await chain?.close()
})

describe('coordinator × lighthouse pledges (A-P5 5.5–5.7)', () => {
  let provider: Wallet, agent: Wallet, human1: Wallet, human2: Wallet, stranger: Wallet
  let terms: PoolTerms
  let h1: LighthousePledge, h2: LighthousePledge
  let bot: AgentBot

  it('setup: a pool of 1,000 credits with the offer at the coordinator', async () => {
    ;[provider, agent, human1, human2, stranger] = await Promise.all(Array.from({ length: 5 }, async () => await chain.makeWallet()))
    for (const w of [provider, agent, human1, human2]) await chain.fund(w)
    const height = await chain.services.getHeight()
    const kitP = kitFor(provider)
    const { tokenId } = await kitP.deploy({ sym: 'LIGHT', amt: 1000n, dec: 0 })
    const reserved = await buildReserveAndAnnounce(provider, kitP, {
      v: '1', providerApi: 'http://localhost:8092', tokenId, credits: '1000', priceSats: '10000', feeSats: '50',
      minCredits: '100', deadlineHeight: String(height + 144), label: 'lighthouse', retailSatsPerCredit: '15'
    })
    terms = reserved.terms
    expect((await post('/offers', await signOffer(provider, terms.poolId, terms))).status).toBe(201)
  })

  it('POST /pledges/lighthouse: a valid pledge is kept and put on the overlay; a bad signature or an unknown guard is refused', async () => {
    h1 = await buildLighthousePledge(human1, terms, '300', { tokenIndex: await kitFor(human1).nextIndex(human1.identityKey), guard: guardWallet.identityKey })
    h2 = await buildLighthousePledge(human2, terms, '200', { tokenIndex: await kitFor(human2).nextIndex(human2.identityKey), guard: guardWallet.identityKey, feeSats: 150 })

    const sig = Utils.toArray(h1.humanSignatureHex, 'hex'); sig[10] ^= 1
    expect(await post('/pledges/lighthouse', { ...h1, humanSignatureHex: Utils.toHex(sig) })).toMatchObject({ status: 422, body: { code: 'LIGHTHOUSE_INVALID' } })
    expect((await post('/pledges/lighthouse', { outpoint: h1.outpoint })).status).toBe(400)

    await chain.fund(stranger)
    const orphan = await buildLighthousePledge(stranger, terms, '100', { tokenIndex: 0, guard: PrivateKey.fromRandom().toPublicKey().toString() }) // a guard nobody runs here
    expect(await post('/pledges/lighthouse', orphan)).toMatchObject({ status: 422, body: { code: 'GUARD_UNKNOWN' } })

    expect(await post('/pledges/lighthouse', h1)).toMatchObject({ status: 201, body: { outpoint: h1.outpoint, poolId: terms.poolId, guard: guardWallet.identityKey, accepted: true } })
    const pledges = await (await fetch(`${coop.url}/pools/${terms.poolId}/pledges`)).json()
    expect(pledges.find((p: any) => p.outpoint === h1.outpoint)).toMatchObject({ mode: 'lighthouse', guard: guardWallet.identityKey, valid: true })
  })

  it('a lighthouse pledge only on the overlay (not given to the coordinator) is left out: no round', async () => {
    const kitA = kitFor(agent)
    const aPledge = await buildPledge(agent, terms, '500', 'p2pkh', undefined, { tokenIndex: await kitA.nextIndex(agent.identityKey) })
    bot = await startAgentBot(coop.url, agent, agent.identityKey, aPledge, fetchTx)
    await kitA.overlay.submit(aPledge.beef)
    await kitA.overlay.submit(h2.beef) // 300 + 200 + 500 = 1,000 on the overlay, but nobody here holds h2's signature
    await new Promise(resolve => setTimeout(resolve, 1_500))
    expect(logs.filter(l => ['round_start', 'plan_failed'].includes(l.event) && l.poolId === terms.poolId)).toEqual([])
    expect((await (await fetch(`${coop.url}/pools/${terms.poolId}`)).json()).coordinator?.lastRound).toBeUndefined()
  })

  it('once given, the round runs: the agent signs over WS, the guard co-signs both humans; one settlement pays everyone', async () => {
    // h2 is already on the overlay, so it is posted without beef (as the web app does); the coordinator reads the tx there.
    expect(await post('/pledges/lighthouse', { ...h2, beef: undefined, record: { ...h2.record, poolId: `${'00'.repeat(32)}_0` } })).toMatchObject({ status: 404, body: { code: 'LIGHTHOUSE_NOT_ON_OVERLAY' } })
    expect((await post('/pledges/lighthouse', { ...h2, beef: undefined })).status).toBe(201)
    const settled = await waitUntil(() => bot.messages.find(m => m.type === 'settled' && m.poolId === terms.poolId), 30_000, 'settled')
    expect(logs.filter(l => l.event === 'sign_ok' && l.poolId === terms.poolId && l.by === 'guard')).toHaveLength(2)
    expect(bot.plans[0].participants.map(p => p.mode ?? 'interactive')).toEqual(['interactive', 'lighthouse', 'lighthouse'])

    const tx = await fetchTx(settled.txid)
    for (const h of [h1, h2]) expect(tx.outputs.some(o => o.lockingScript.toHex() === h.creditLockingScriptHex)).toBe(true)
    // The humans come back later and simply sync.
    for (const [w, amt] of [[human1, 300n], [human2, 200n]] as const) {
      const kit = kitFor(w)
      await kit.sync()
      expect((await kit.balances()).find(b => b.tokenId === terms.tokenId)?.overlay).toBe(amt)
    }
    const audit = await (await fetch(`${coop.url}/pools/${terms.poolId}/audit`)).json()
    expect(audit).toMatchObject({ verdict: 'consistent', checks: { creditsDelivered: true, providerPaid: true, hashMatches: true } })
    const metrics = await (await fetch(`${coop.url}/metrics`)).json()
    expect(metrics).toMatchObject({ custodiedSats: 0, custodyCheck: { unaccountedOutputs: [] } })
  })

  it('a pool filled by one lighthouse pledge alone settles: nobody on WS, the guard signs', async () => {
    const height = await chain.services.getHeight()
    const kitP = kitFor(provider)
    const { tokenId } = await kitP.deploy({ sym: 'SOLO', amt: 10n, dec: 0 })
    const reserved = await buildReserveAndAnnounce(provider, kitP, {
      v: '1', providerApi: 'http://localhost:8092', tokenId, credits: '10', priceSats: '250', feeSats: '100',
      minCredits: '5', deadlineHeight: String(height + 144), label: 'solo lighthouse', retailSatsPerCredit: '50'
    })
    const solo = reserved.terms
    expect((await post('/offers', await signOffer(provider, solo.poolId, solo))).status).toBe(201)
    const lp = await buildLighthousePledge(human1, solo, '10', { tokenIndex: await kitFor(human1).nextIndex(human1.identityKey), guard: guardWallet.identityKey })
    expect((await post('/pledges/lighthouse', lp)).status).toBe(201)
    const settled = await waitUntil(async () => {
      const v = await (await fetch(`${coop.url}/pools/${solo.poolId}`)).json()
      return v.status === 'settled' ? v : undefined
    }, 30_000, 'solo settled')
    const tx = await fetchTx(settled.settledTxid)
    expect(tx.outputs.some(o => o.lockingScript.toHex() === lp.creditLockingScriptHex)).toBe(true)
    expect(tx.outputs[0].satoshis).toBe(250)
    const kit = kitFor(human1)
    await kit.sync()
    expect((await kit.balances()).find(b => b.tokenId === tokenId)?.overlay).toBe(10n)
    // The audit re-runs the selection rule; the coin carries exactly its fee, so it may need rate 0 (mainnet 31.10).
    const audit = await (await fetch(`${coop.url}/pools/${solo.poolId}/audit`)).json()
    expect(audit).toMatchObject({ verdict: 'consistent', checks: { selectionMatches: true, creditsDelivered: true } })
  })
})
