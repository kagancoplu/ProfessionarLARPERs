/**
 * B-P5a: the public edge. Proven `hello` (challenge → signed nonce bound to
 * the host), the impersonation attack it closes, per-IP HTTP and WS limits,
 * CORS, and the overlay's limits and healthz.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Transaction } from '@agentcoop/core/sdk'
import type { Wallet } from '@bsv/wallet-toolbox'
import { WebSocket } from 'ws'
import { buildPledge, buildReserveAndAnnounce, COOP_SERVICE, COOP_TOPIC, OverlayClient, signOffer, TokenKit, type PoolTerms } from '@agentcoop/core'
import { startOverlay, type RunningOverlay } from '../../../packages/overlay/src/server'
import { createMockChain, type MockChain } from '../../../test/helpers/mockchain'
import { broadcastMock } from '../../../packages/overlay/test/helpers/settlement'
import { signHello } from '../src/auth'
import { ManualHeight } from '../src/chain'
import { connectCoordinator } from '../src/client'
import { coreProtocol } from '../src/protocol'
import { noSpentChecker } from '../src/spent'
import { startCoordinator, type RunningCoordinator } from '../src/server'
import { startAgentBot } from './helpers/agentBot'
import { waitUntil } from './helpers/coopPool'

let chain: MockChain
let overlay: RunningOverlay
let coop: RunningCoordinator
const logs: any[] = []
const COOP_PORT = 18791

const fetchTx = async (txid: string): Promise<Transaction> =>
  Transaction.fromBinary(Array.from((await (chain.services as any).storage.getTransaction(txid)).rawTx as number[]))
const kitFor = (w: Wallet): TokenKit => new TokenKit(w, new OverlayClient(overlay.url, undefined, 'main', undefined, COOP_TOPIC, COOP_SERVICE))

/** Raw WS client (no proof unless the test sends one). */
async function rawClient (headers: Record<string, string> = {}): Promise<{ ws: WebSocket, messages: any[], waitFor: (pred: (m: any) => boolean, ms?: number) => Promise<any>, closed: Promise<number> }> {
  const ws = new WebSocket(`ws://localhost:${COOP_PORT}/ws`, { headers })
  const messages: any[] = []
  ws.on('message', d => messages.push(JSON.parse(d.toString())))
  const closed = new Promise<number>(resolve => ws.once('close', code => resolve(code)))
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject) })
  const waitFor = async (pred: (m: any) => boolean, ms = 10_000): Promise<any> => {
    const end = Date.now() + ms
    for (;;) {
      const hit = messages.find(pred)
      if (hit !== undefined) return hit
      if (Date.now() > end) throw new Error(`timed out; got ${JSON.stringify(messages)}`)
      await new Promise(resolve => setTimeout(resolve, 25))
    }
  }
  return { ws, messages, waitFor, closed }
}

beforeAll(async () => {
  chain = await createMockChain()
  const dir = mkdtempSync(join(tmpdir(), 'agentcoop-edge-'))
  overlay = await startOverlay({ port: 18790, dbFile: join(dir, 'overlay.db'), chainTracker: chain.chainTracker, quiet: true, rateLimit: { lookupPerMin: 3, submitPerMin: 3 } })
  const height = await chain.services.getHeight()
  coop = await startCoordinator(
    {
      port: COOP_PORT, overlayUrl: overlay.url, arcadeUrl: 'http://unused.invalid', dbFile: join(dir, 'coordinator.db'), pollMs: 500, roundTimeoutMs: 15_000, maxRounds: 3, spentCheck: 'none', network: 'main',
      rateLimit: { getPerMin: 5, postPerMin: 2 },
      feedLimits: { maxPerIp: 2, maxClients: 100, maxMessagesPer10s: 10 }
    },
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

describe('proven hello', () => {
  let victim: Wallet, other: Wallet
  let victimId: string

  beforeAll(async () => {
    ;[victim, other] = await Promise.all([chain.makeWallet(), chain.makeWallet()])
    victimId = (await victim.getPublicKey({ identityKey: true })).publicKey
  })

  it('a signed nonce proves the identity; a hello without sig is a watcher', async () => {
    const s = await connectCoordinator(coop.url, victim)
    expect(s.messages.find(m => m.type === 'hello_ack')).toMatchObject({ identity: victimId, proven: true })
    const watcher = await rawClient()
    await watcher.waitFor(m => m.type === 'challenge')
    watcher.ws.send(JSON.stringify({ type: 'hello', identity: victimId, poolIds: [] }))
    expect(await watcher.waitFor(m => m.type === 'hello_ack')).toMatchObject({ identity: victimId, proven: false })
    const anon = await rawClient()
    anon.ws.send(JSON.stringify({ type: 'hello', poolIds: [] }))
    expect(await anon.waitFor(m => m.type === 'hello_ack')).toMatchObject({ proven: false })
    expect(coop.feed.counts()).toMatchObject({ proven: 1 })
    for (const c of [s.ws, watcher.ws, anon.ws]) c.close()
    await new Promise(resolve => setTimeout(resolve, 100))
  })

  it('rejects a sig by another key, for another host, or over another connection\'s nonce', async () => {
    const a = await rawClient()
    const { nonce } = await a.waitFor(m => m.type === 'challenge')
    const host = `localhost:${COOP_PORT}`
    // another wallet signs the victim's hello
    a.ws.send(JSON.stringify({ type: 'hello', identity: victimId, poolIds: [], sig: await signHello(other, host, nonce) }))
    expect((await a.waitFor(m => m.type === 'error')).error).toMatch(/does not prove/)
    // the victim signed this nonce for a different coordinator (relay from a fake one)
    a.messages.length = 0
    a.ws.send(JSON.stringify({ type: 'hello', identity: victimId, poolIds: [], sig: await signHello(victim, 'evil.example', nonce) }))
    expect((await a.waitFor(m => m.type === 'error')).error).toMatch(/does not prove/)
    // a proof made for connection b is replayed on connection a
    a.ws.close()
    const b = await rawClient()
    const { nonce: nonceB } = await b.waitFor(m => m.type === 'challenge')
    const c = await rawClient()
    await c.waitFor(m => m.type === 'challenge')
    c.ws.send(JSON.stringify({ type: 'hello', identity: victimId, poolIds: [], sig: await signHello(victim, host, nonceB) }))
    expect((await c.waitFor(m => m.type === 'error')).error).toMatch(/does not prove/)
    // the same proof on its own connection works
    b.ws.send(JSON.stringify({ type: 'hello', identity: victimId, poolIds: [], sig: await signHello(victim, host, nonceB) }))
    expect(await b.waitFor(m => m.type === 'hello_ack')).toMatchObject({ proven: true })
    b.ws.close(); c.ws.close()
    await new Promise(resolve => setTimeout(resolve, 100))
  })
})

describe('impersonation attack (closed by B-P5a)', () => {
  let provider: Wallet, agent1: Wallet, agent2: Wallet
  let terms: PoolTerms

  it('an attacker using the victim\'s identity without proof gets no sign_request and cannot reject for the victim', async () => {
    ;[provider, agent1, agent2] = await Promise.all([chain.makeWallet(), chain.makeWallet(), chain.makeWallet()])
    for (const w of [provider, agent1, agent2]) await chain.fund(w)
    const [kitP, kit1, kit2] = [kitFor(provider), kitFor(agent1), kitFor(agent2)]
    const height = await chain.services.getHeight()
    const { tokenId } = await kitP.deploy({ sym: 'EDGE', amt: 1000n, dec: 0 })
    terms = (await buildReserveAndAnnounce(provider, kitP, {
      v: '1', providerApi: 'http://localhost:8092', tokenId, credits: '1000', priceSats: '10000', feeSats: '50',
      minCredits: '100', deadlineHeight: String(height + 144), label: 'edge', retailSatsPerCredit: '15'
    })).terms
    const offer = await signOffer(provider, terms.poolId, terms)
    expect((await fetch(`${coop.url}/offers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(offer) })).status).toBe(201)

    const victimId = await kit1.identityKey()
    // A browser watcher that never says hello still gets the pool's progress (Track E's request).
    const watcher = await rawClient()
    // The attacker says hello as the victim, without a proof, and pre-sends rejects for round 1.
    const attacker = await rawClient()
    attacker.ws.send(JSON.stringify({ type: 'hello', identity: victimId, poolIds: [terms.poolId] }))
    await attacker.waitFor(m => m.type === 'hello_ack')

    const p1 = await buildPledge(agent1, terms, '600', 'p2pkh', undefined, { tokenIndex: await kit1.nextIndex(victimId) })
    const p2 = await buildPledge(agent2, terms, '400', 'p2pkh', undefined, { tokenIndex: await kit2.nextIndex(await kit2.identityKey()) })
    const bots = [
      await startAgentBot(coop.url, agent1, victimId, p1, fetchTx, { delayMs: 1_500 }), // the attacker gets a window
      await startAgentBot(coop.url, agent2, await kit2.identityKey(), p2, fetchTx)
    ]
    for (const p of [p1, p2]) await kit1.overlay.submit(p.beef)
    // The attacker rejects for the victim while round 1 is open (the victim answers after 1.5 s), staying under
    // this test's WS limit of 10 messages per 10 s: spamming from before the round got the attacker's connection
    // closed (1008) when the pledges took long to submit, and then no error came back at all.
    await waitUntil(() => logs.find(l => l.event === 'round_start' && l.poolId === terms.poolId), 30_000, 'round 1')
    let sent = 0
    const spam = setInterval(() => {
      if (++sent > 5) return
      attacker.ws.send(JSON.stringify({ type: 'sign_reject', poolId: terms.poolId, round: 1, reason: 'griefing' }))
    }, 200)

    const settled = await new Promise<any>((resolve, reject) => {
      const end = Date.now() + 30_000
      const t = setInterval(() => {
        const m = bots[0].messages.find(x => x.type === 'settled' && x.poolId === terms.poolId)
        if (m !== undefined) { clearInterval(t); resolve(m) } else if (Date.now() > end) { clearInterval(t); reject(new Error('not settled')) }
      }, 50)
    })
    clearInterval(spam)
    expect(settled.txid).toMatch(/^[0-9a-f]{64}$/)
    expect(attacker.messages.some(m => m.type === 'sign_request')).toBe(false)
    await watcher.waitFor(m => m.type === 'pool_update' && m.poolId === terms.poolId && m.status === 'settled')
    expect(watcher.messages.some(m => m.type === 'sign_request')).toBe(false)
    watcher.ws.close()
    // GET /pools?pledges=1 (Track E): the settled pool lists no unspent pledges; an open one would list them in order
    const withPledges = await (await fetch(`${coop.url}/pools?pledges=1`)).json()
    expect(withPledges.find((p: any) => p.poolId === terms.poolId)).toMatchObject({ status: 'settled', pledges: [] })
    expect(attacker.messages.some(m => m.type === 'error' && m.error === 'say hello first')).toBe(true)
    expect(logs.some(l => l.event === 'sign_reject')).toBe(false)
    expect((await (await fetch(`${coop.url}/pools/${terms.poolId}`)).json()).coordinator).toMatchObject({ blacklist: [], lastRound: { round: 1, outcome: 'settled' } })
    attacker.ws.close()
    for (const b of bots) b.ws.close()
    await new Promise(resolve => setTimeout(resolve, 100))
  })
})

describe('HTTP and WS limits, CORS, healthz', () => {
  it('limits GET and POST per client IP behind the proxy; loopback is exempt', async () => {
    const outside = { 'X-Forwarded-For': '203.0.113.7' }
    const codes: number[] = []
    for (let i = 0; i < 6; i++) codes.push((await fetch(`${coop.url}/pools`, { headers: outside })).status)
    expect(codes.slice(0, 5).every(c => c === 200)).toBe(true)
    const limited = await fetch(`${coop.url}/pools`, { headers: outside })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toMatch(/^\d+$/)
    expect(await limited.json()).toMatchObject({ code: 'RATE_LIMITED' })
    // another client is not affected, loopback never is
    expect((await fetch(`${coop.url}/pools`, { headers: { 'X-Forwarded-For': '198.51.100.9' } })).status).toBe(200)
    expect((await fetch(`${coop.url}/pools`, { headers: { 'X-Forwarded-For': '1.2.3.4, 203.0.113.7' } })).status).toBe(429)
    for (let i = 0; i < 8; i++) expect((await fetch(`${coop.url}/pools`)).status).toBe(200)
    // POST: 2 per minute
    const post = async (): Promise<number> => (await fetch(`${coop.url}/offers`, { method: 'POST', headers: { ...outside, 'X-Forwarded-For': '203.0.113.8', 'Content-Type': 'application/json' }, body: '{}' })).status
    expect([await post(), await post(), await post()]).toEqual([400, 400, 429])
  })

  it('CORS: any origin may read; preflight answers 204', async () => {
    const res = await fetch(`${coop.url}/pools`, { headers: { Origin: 'https://someone-else.example' } })
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    const pre = await fetch(`${coop.url}/offers`, { method: 'OPTIONS', headers: { Origin: 'https://someone-else.example', 'Access-Control-Request-Method': 'POST' } })
    expect(pre.status).toBe(204)
    expect(pre.headers.get('access-control-allow-methods')).toMatch(/POST/)
  })

  it('WS: at most maxPerIp connections per client IP; a flooding connection is closed', async () => {
    const ip = { 'X-Forwarded-For': '192.0.2.44' }
    const a = await rawClient(ip)
    const b = await rawClient(ip)
    const c = await rawClient(ip)
    expect(await c.closed).toBe(1013)
    // a spoofed first hop does not help: the proxy appends the real address last
    const d = await rawClient({ 'X-Forwarded-For': '10.9.9.9, 192.0.2.44' })
    expect(await d.closed).toBe(1013)
    a.ws.close(); b.ws.close()
    const f = await rawClient()
    await f.waitFor(m => m.type === 'challenge')
    for (let i = 0; i < 15; i++) f.ws.send(JSON.stringify({ type: 'hello', poolIds: [] }))
    expect(await f.closed).toBe(1008)
  })

  it('healthz reports overlay, engine, open pools and WS clients', async () => {
    const h = await (await fetch(`${coop.url}/healthz`)).json()
    expect(h).toMatchObject({ ok: true, overlay: true, engine: true, arcade: true })
    expect(typeof h.openPools).toBe('number')
    expect(h.ws).toMatchObject({ clients: expect.any(Number), proven: expect.any(Number) })
  })

  it('overlay: /agentcoop/healthz, lookup limit per client IP, 10 MB body cap', async () => {
    const h = await (await fetch(`${overlay.url}/agentcoop/healthz`)).json()
    expect(h).toMatchObject({ ok: true, db: true })
    expect(h.lastEventAt).not.toBeNull() // the pool above was admitted

    const lookup = async (ip?: string): Promise<number> => (await fetch(`${overlay.url}/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(ip !== undefined ? { 'X-Forwarded-For': ip } : {}) },
      body: JSON.stringify({ service: COOP_SERVICE, query: { op: 'pools' } })
    })).status
    const ip = '203.0.113.50'
    expect([await lookup(ip), await lookup(ip), await lookup(ip), await lookup(ip)]).toEqual([200, 200, 200, 429])
    expect(await lookup()).toBe(200) // the coordinator on the same box

    const big = await fetch(`${overlay.url}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Topics': JSON.stringify([COOP_TOPIC]) },
      body: new Uint8Array(11 * 1024 * 1024)
    })
    expect(big.status).toBe(413)
  })
})
