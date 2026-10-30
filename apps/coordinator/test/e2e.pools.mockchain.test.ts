/**
 * B.P1 end to end (plan/phases/B-P1.md §8): overlay + coordinator side API +
 * WS feed in one process, real wallet-toolbox wallets on the mock chain.
 * Mirrors the walking skeleton (A.P1.7): pool → offer → pledges → settlement,
 * with the settlement using the offer stored by the coordinator.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LockingScript, Transaction, UnlockingScript } from '@agentcoop/core/sdk'
import type { Wallet } from '@bsv/wallet-toolbox'
import { WebSocket } from 'ws'
import { startOverlay, type RunningOverlay } from '../../../packages/overlay/src/server'
import { createMockChain, type MockChain } from '../../../test/helpers/mockchain'
import { broadcastMock, buildSettlement, SCOPE_ALL, SCOPE_SINGLE_ACP, signInput, submitToOverlay } from '../../../packages/overlay/test/helpers/settlement'
import { beefOf, openPool, pledge, type OpenedPool } from '../../../packages/overlay/test/helpers/pool'
import type { Offer } from '@agentcoop/core'
import { ManualHeight } from '../src/chain'
import { startCoordinator, type RunningCoordinator } from '../src/server'

let chain: MockChain
let overlay: RunningOverlay
let coop: RunningCoordinator
const height = new ManualHeight(500)
let provider: Wallet, a1: Wallet, a2: Wallet

const submit = async (atomicBeef: number[]): Promise<void> => {
  expect((await submitToOverlay(overlay.url, beefOf(atomicBeef))).status).toBe(200)
}
const get = async (path: string): Promise<{ status: number, body: any }> => {
  const res = await fetch(`${coop.url}${path}`)
  return { status: res.status, body: await res.json() }
}
const postOffer = async (offer: unknown): Promise<{ status: number, body: any }> => {
  const res = await fetch(`${coop.url}/offers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(offer) })
  return { status: res.status, body: await res.json() }
}

/** Provider's offer: in0 = pool credit UTXO, out0 = priceSats → payScriptHex, signed with `scope` (A's signOffer stand-in). */
async function signOffer (pool: OpenedPool, scope: number): Promise<Offer> {
  const tx = new Transaction()
  tx.addInput({ sourceTransaction: pool.credit.sourceTransaction, sourceOutputIndex: 0, unlockingScript: new UnlockingScript([]), sequence: 0xffffffff })
  tx.addOutput({ lockingScript: LockingScript.fromHex(pool.terms.payScriptHex), satoshis: Number(pool.terms.priceSats) })
  const unlock = await signInput(provider, tx, 0, pool.credit.key, scope)
  return { poolId: pool.poolId, unlockingScriptHex: unlock.toHex(), lockingScriptHex: pool.credit.lockingScript.toHex(), satoshis: pool.credit.satoshis, terms: pool.terms }
}

/** WS client that records messages. */
async function wsClient (): Promise<{ ws: WebSocket, messages: any[], waitFor: (pred: (m: any) => boolean, ms?: number) => Promise<any> }> {
  const ws = new WebSocket(`${coop.url.replace('http', 'ws')}/ws`)
  const messages: any[] = []
  ws.on('message', d => messages.push(JSON.parse(d.toString())))
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject) })
  const waitFor = async (pred: (m: any) => boolean, ms = 10_000): Promise<any> => {
    const end = Date.now() + ms
    for (;;) {
      const hit = messages.find(pred)
      if (hit !== undefined) return hit
      if (Date.now() > end) throw new Error(`timed out; got ${JSON.stringify(messages)}`)
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }
  return { ws, messages, waitFor }
}

beforeAll(async () => {
  chain = await createMockChain()
  const dir = mkdtempSync(join(tmpdir(), 'agentcoop-coord-'))
  overlay = await startOverlay({ port: 18290, dbFile: join(dir, 'overlay.db'), chainTracker: chain.chainTracker, quiet: true })
  coop = await startCoordinator({ port: 18291, overlayUrl: overlay.url, arcadeUrl: 'http://unused.invalid', dbFile: join(dir, 'coordinator.db'), pollMs: 200, roundTimeoutMs: 60_000, maxRounds: 3, spentCheck: 'none', network: 'main' }, { height })
  ;[provider, a1, a2] = await Promise.all([chain.makeWallet(), chain.makeWallet(), chain.makeWallet()])
  for (const w of [provider, a1, a2]) await chain.fund(w)
})

afterAll(async () => {
  await coop?.close()
  await overlay?.close()
  await chain?.close()
})

describe('coordinator side API + WS feed', () => {
  let p: OpenedPool
  let offer: Offer
  let client: Awaited<ReturnType<typeof wsClient>>

  it('lists a new pool from the overlay; WS hello gets an ack and the current state', async () => {
    p = await openPool(provider, { deadlineHeight: 1_000 })
    await submit(p.deployTx)
    await submit(p.poolTx)
    const { status, body } = await get(`/pools/${p.poolId}`)
    expect(status).toBe(200)
    expect(body).toMatchObject({ poolId: p.poolId, status: 'open', pledgedCredits: '0', target: '1000', hasOffer: false, height: 500 })
    expect((await get('/pools')).body.map((x: any) => x.poolId)).toContain(p.poolId)

    client = await wsClient()
    const { publicKey } = await a1.getPublicKey({ identityKey: true })
    client.ws.send(JSON.stringify({ type: 'hello', identity: publicKey, poolIds: [p.poolId] }))
    expect(await client.waitFor(m => m.type === 'hello_ack')).toMatchObject({ identity: publicKey })
    expect(await client.waitFor(m => m.type === 'pool_update' && m.poolId === p.poolId)).toMatchObject({ pledgedCredits: '0', status: 'open' })
    expect([...coop.feed.sessions.values()].some(s => s.identity === publicKey)).toBe(true)
  })

  it('POST /offers rejects an ALL-signed offer, mismatched terms and a bad hello', async () => {
    const all = await postOffer(await signOffer(p, SCOPE_ALL))
    expect(all).toMatchObject({ status: 400, body: { code: 'BAD_OFFER' } })
    const good = await signOffer(p, SCOPE_SINGLE_ACP)
    expect(await postOffer({ ...good, terms: { ...good.terms, priceSats: '1' } })).toMatchObject({ status: 400, body: { code: 'TERMS_MISMATCH' } })
    expect(await postOffer({ ...good, poolId: `${'00'.repeat(32)}_0` })).toMatchObject({ status: 404, body: { code: 'POOL_NOT_FOUND' } })
    client.ws.send(JSON.stringify({ type: 'hello', identity: 'nope' }))
    expect(await client.waitFor(m => m.type === 'error')).toBeDefined()
  })

  it('POST /offers accepts the provider SINGLE|ACP offer; GET returns it', async () => {
    offer = await signOffer(p, SCOPE_SINGLE_ACP)
    expect(await postOffer(offer)).toMatchObject({ status: 201, body: { accepted: true } })
    expect((await get(`/offers/${p.poolId}`)).body).toEqual(offer)
    expect((await get(`/pools/${p.poolId}`)).body.hasOffer).toBe(true)
  })

  it('pledges show up in /pledges and in the WS feed', async () => {
    const x1 = await pledge(a1, p, 600n)
    const x2 = await pledge(a2, p, 400n)
    await submit(x1.tx)
    await submit(x2.tx)
    expect(await client.waitFor(m => m.type === 'pool_update' && m.pledgedCredits === '1000')).toMatchObject({ status: 'open' })
    const { body } = await get(`/pools/${p.poolId}/pledges`)
    expect(body.map((x: any) => x.outpoint).sort()).toEqual([`${x1.txid}_0`, `${x2.txid}_0`].sort())

    // Settlement with the coordinator's stored offer (no new provider signature).
    const stored = (await get(`/offers/${p.poolId}`)).body as Offer
    const parts = [{ w: a1, x: x1 }, { w: a2, x: x2 }].map(({ w, x }) => ({
      w, part: { coin: x.coin, identityKey: x.identityKey, credits: x.credits, share: Number(x.credits) * 4_500 / 1000, fee: 100 }
    }))
    const tx = buildSettlement({ offer: p.credit, tokenId: p.terms.tokenId, priceSats: 4_500, payScript: LockingScript.fromHex(p.terms.payScriptHex), participants: parts.map(q => q.part), poolId: p.poolId })
    tx.inputs[0].unlockingScript = UnlockingScript.fromHex(stored.unlockingScriptHex)
    for (const [i, { w, part }] of parts.entries()) tx.inputs[i + 1].unlockingScript = await signInput(w, tx, i + 1, part.coin.key, SCOPE_ALL)
    await broadcastMock(chain.services, tx)
    expect((await submitToOverlay(overlay.url, tx.toBEEF())).status).toBe(200)
    expect(await client.waitFor(m => m.type === 'pool_update' && m.status === 'settled')).toMatchObject({ poolId: p.poolId })
    expect((await get(`/pools/${p.poolId}`)).body).toMatchObject({ status: 'settled', settledTxid: tx.id('hex') })
    expect(await postOffer(offer)).toMatchObject({ status: 409, body: { code: 'POOL_NOT_OPEN' } })
  })

  it('an open pool past its deadline is reported as failed', async () => {
    const q = await openPool(provider, { deadlineHeight: 600 })
    await submit(q.deployTx)
    await submit(q.poolTx)
    expect((await get(`/pools/${q.poolId}`)).body.status).toBe('open')
    height.value = 600
    expect((await get(`/pools/${q.poolId}`)).body.status).toBe('failed')
    client.ws.close()
  })
})
