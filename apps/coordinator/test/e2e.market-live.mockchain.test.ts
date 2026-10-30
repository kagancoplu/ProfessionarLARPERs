/**
 * B.P3 (plan/phases/B-P3.md §5, scenarios 5–8): market listings and a sweep,
 * the live feed driven by overlay events, and round progress surviving a
 * coordinator restart. Mock chain; overlay + coordinator in one process.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LockingScript, Random, Transaction, UnlockingScript, Utils } from '@bsv/sdk'
import type { Wallet } from '@bsv/wallet-toolbox'
import { startOverlay, type RunningOverlay } from '../../../packages/overlay/src/server'
import { buildBsv21Script } from '../../../packages/overlay/src/kit/inscription'
import { instructionsFor, receivePkh, TOKEN_BASKET, TOKEN_PROTOCOL } from '../../../packages/overlay/src/kit/addresses'
import type { Listing, Offer } from '../../../packages/overlay/src/stub/types'
import { createMockChain, type MockChain } from '../../../packages/overlay/test/helpers/mockchain'
import {
  broadcastMock, coinFrom, deployCredits, lookup, makePledgeCoin, p2pkhFor, SCOPE_ALL, SCOPE_SINGLE_ACP, signInput, submitToOverlay, type Coin
} from '../../../packages/overlay/test/helpers/settlement'
import { beefOf, openPool, pledge, spendCoin, type OpenedPool } from '../../../packages/overlay/test/helpers/pool'
import { ManualHeight } from '../src/chain'
import { noSpentChecker } from '../src/spent'
import { startCoordinator, type RunningCoordinator } from '../src/server'
import type { CoordinatorConfig } from '../src/config'
import { devProtocol } from './helpers/devProtocol'
import { startBot, type Bot } from './helpers/participant'

let chain: MockChain
let overlay: RunningOverlay
let coop: RunningCoordinator
let config: CoordinatorConfig
const height = new ManualHeight(500)
const logs: any[] = []
let provider: Wallet, seller: Wallet, buyer: Wallet, silent: Wallet, signer: Wallet

const startCoop = async (): Promise<RunningCoordinator> => await startCoordinator(config, {
  height, protocol: devProtocol(chain.services), spent: noSpentChecker, log: (event, f) => { logs.push({ event, ...f }) }
})
const submit = async (atomicBeef: number[]): Promise<void> => { expect((await submitToOverlay(overlay.url, beefOf(atomicBeef))).status).toBe(200) }
const get = async (path: string): Promise<any> => await (await fetch(`${coop.url}${path}`)).json()
const post = async (path: string, body: unknown): Promise<{ status: number, body: any }> => {
  const res = await fetch(`${coop.url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { status: res.status, body: await res.json() }
}

/** Seller's listing: SINGLE|ACP over its credit UTXO for "the output at my index pays askSats to me". */
async function signListing (coin: Coin, tokenId: string, credits: bigint, askSats: number): Promise<Listing> {
  const payScript = await p2pkhFor(seller, { protocolID: [1, 'agentcoop market'], keyID: Utils.toHex(Random(8)) })
  const tx = new Transaction()
  tx.addInput({ sourceTransaction: coin.sourceTransaction, sourceOutputIndex: coin.vout, unlockingScript: new UnlockingScript([]), sequence: 0xffffffff })
  tx.addOutput({ lockingScript: payScript, satoshis: askSats })
  const unlock = await signInput(seller, tx, 0, coin.key, SCOPE_SINGLE_ACP)
  const { publicKey } = await seller.getPublicKey({ identityKey: true })
  return {
    outpoint: `${coin.sourceTransaction.id('hex')}.${coin.vout}`,
    tokenId,
    credits: credits.toString(),
    askSats: String(askSats),
    seller: publicKey,
    unlockingScriptHex: unlock.toHex(),
    lockingScriptHex: coin.lockingScript.toHex(),
    payScriptHex: payScript.toHex()
  }
}

beforeAll(async () => {
  chain = await createMockChain()
  const dir = mkdtempSync(join(tmpdir(), 'agentcoop-p3-'))
  overlay = await startOverlay({ port: 18490, dbFile: join(dir, 'overlay.db'), chainTracker: chain.chainTracker, quiet: true })
  // A 60 s poll: anything faster than that comes from the overlay's event stream.
  config = { port: 18491, overlayUrl: overlay.url, arcadeUrl: 'http://unused.invalid', dbFile: join(dir, 'coordinator.db'), pollMs: 60_000, roundTimeoutMs: 1_500, maxRounds: 3, spentCheck: 'none', network: 'main' }
  coop = await startCoop()
  ;[provider, seller, buyer, silent, signer] = await Promise.all([1, 2, 3, 4, 5].map(async () => await chain.makeWallet()))
  for (const w of [provider, seller, buyer, silent, signer]) await chain.fund(w)
})

afterAll(async () => {
  await coop?.close()
  await overlay?.close()
  await chain?.close()
})

describe('market listings', () => {
  let tokenId: string
  let l600: Listing, l400: Listing
  let c600: Coin, c400: Coin

  it('5. POST /listings verifies against the chain; GET lists the cheapest per credit first', async () => {
    const d = await deployCredits(seller, 1000n, 'MKT')
    tokenId = d.tokenId
    await submit(Array.from(d.coin.sourceTransaction.toAtomicBEEF()))
    const { publicKey: me } = await seller.getPublicKey({ identityKey: true })
    const s600 = buildBsv21Script({ op: 'transfer', id: tokenId, amt: '600' }, receivePkh(me, 1))
    const s400 = buildBsv21Script({ op: 'transfer', id: tokenId, amt: '400' }, receivePkh(me, 2))
    const split = await spendCoin(seller, d.coin, [
      { lockingScript: s600.toHex(), satoshis: 1, outputDescription: 'credits 600', basket: TOKEN_BASKET, customInstructions: JSON.stringify(instructionsFor(1)) },
      { lockingScript: s400.toHex(), satoshis: 1, outputDescription: 'credits 400', basket: TOKEN_BASKET, customInstructions: JSON.stringify(instructionsFor(2)) }
    ], 'Split credits for listing')
    await submit(split)
    c600 = coinFrom(split, s600, { protocolID: TOKEN_PROTOCOL, keyID: '1' })
    c400 = coinFrom(split, s400, { protocolID: TOKEN_PROTOCOL, keyID: '2' })

    l600 = await signListing(c600, tokenId, 600n, 700) // 1.17 sat/credit
    l400 = await signListing(c400, tokenId, 400n, 400) // 1.00 sat/credit
    expect(await post('/listings', { ...l600, credits: '500' })).toMatchObject({ status: 400, body: { code: 'LISTING_MISMATCH' } })
    const tx = new Transaction()
    tx.addInput({ sourceTransaction: c400.sourceTransaction, sourceOutputIndex: c400.vout, unlockingScript: new UnlockingScript([]), sequence: 0xffffffff })
    tx.addOutput({ lockingScript: LockingScript.fromHex(l400.payScriptHex), satoshis: 400 })
    const all = await signInput(seller, tx, 0, c400.key, SCOPE_ALL)
    expect(await post('/listings', { ...l400, unlockingScriptHex: all.toHex() })).toMatchObject({ status: 400, body: { code: 'SIGHASH_NOT_SINGLE_ACP' } })
    expect(await post('/listings', { ...l400, outpoint: `${'00'.repeat(32)}_0` })).toMatchObject({ status: 404, body: { code: 'LISTING_NOT_ON_OVERLAY' } })
    expect((await post('/listings', l600)).status).toBe(201)
    expect((await post('/listings', l400)).status).toBe(201)
    expect((await get(`/listings?tokenId=${tokenId}`)).map((l: Listing) => l.askSats)).toEqual(['400', '700'])
  })

  it('6. a buyer sweeps both listings in one transaction; they drop out of GET /listings', async () => {
    const { publicKey: me } = await buyer.getPublicKey({ identityKey: true })
    const coin = await makePledgeCoin(buyer, 5_000)
    const tx = new Transaction()
    // input i ↔ output i for each listing (SIGHASH_SINGLE), then the buyer's input
    for (const [l, c] of [[l400, c400], [l600, c600]] as const) {
      tx.addInput({ sourceTransaction: c.sourceTransaction, sourceOutputIndex: c.vout, unlockingScript: UnlockingScript.fromHex(l.unlockingScriptHex), sequence: 0xffffffff })
      tx.addOutput({ lockingScript: LockingScript.fromHex(l.payScriptHex), satoshis: Number(l.askSats) })
    }
    tx.addInput({ sourceTransaction: coin.sourceTransaction, sourceOutputIndex: coin.vout, unlockingScript: new UnlockingScript([]), sequence: 0xffffffff })
    tx.addOutput({ lockingScript: buildBsv21Script({ op: 'transfer', id: tokenId, amt: '1000' }, receivePkh(me, 0)), satoshis: 1 })
    tx.addOutput({ lockingScript: coin.lockingScript, satoshis: 5_000 - 400 - 700 - 1 - 200 })
    tx.inputs[2].unlockingScript = await signInput(buyer, tx, 2, coin.key, SCOPE_ALL)
    await broadcastMock(chain.services, tx)
    const { body } = await submitToOverlay(overlay.url, tx.toBEEF())
    expect(body.tm_agentcoop.outputsToAdmit).toEqual([2])
    expect(await get(`/listings?tokenId=${tokenId}`)).toEqual([])
    const held = await lookup(overlay.url, { op: 'identity', identityKey: me, tokenId })
    expect(held.map(o => o.ctx.amt)).toEqual(['1000'])
  })
})

describe('live feed and restart', () => {
  let p: OpenedPool
  let silentPledge: Awaited<ReturnType<typeof pledge>>

  it('7. with a 60 s poll, a pledge still reaches WS subscribers within a second (overlay events)', async () => {
    const watcher = await startBot(coop.url, signer)
    p = await openPool(provider)
    await submit(p.deployTx)
    await submit(p.poolTx)
    await watcher.waitFor(m => m.type === 'pool_update' && m.poolId === p.poolId)
    silentPledge = await pledge(silent, p, 600n)
    await submit(silentPledge.tx)
    const acceptedAt = Date.now()
    await watcher.waitFor(m => m.type === 'pool_update' && m.poolId === p.poolId && m.pledgedCredits === '600', 5_000)
    expect(Date.now() - acceptedAt).toBeLessThan(1_000)
    watcher.close()
  })

  it('8. blacklist and last round survive a coordinator restart', async () => {
    // `silent` pledged 600 in test 7 and never signs; `signer` adds 400 and signs.
    const bots: Bot[] = [await startBot(coop.url, silent, { behavior: () => 'silent' }), await startBot(coop.url, signer)]
    bots[0].addCoin(silentPledge.coin)
    const y = await pledge(signer, p, 400n)
    bots[1].addCoin(y.coin)
    await submit(y.tx)
    const offerTx = new Transaction()
    offerTx.addInput({ sourceTransaction: p.credit.sourceTransaction, sourceOutputIndex: 0, unlockingScript: new UnlockingScript([]), sequence: 0xffffffff })
    offerTx.addOutput({ lockingScript: LockingScript.fromHex(p.terms.payScriptHex), satoshis: Number(p.terms.priceSats) })
    const unlock = await signInput(provider, offerTx, 0, p.credit.key, SCOPE_SINGLE_ACP)
    const offer: Offer = { poolId: p.poolId, unlockingScriptHex: unlock.toHex(), lockingScriptHex: p.credit.lockingScript.toHex(), satoshis: 1, terms: p.terms }
    expect((await post('/offers', offer)).status).toBe(201)
    // Round 1 fails on the silent pledge; the remaining 400 cannot fill the pool, so no round 2.
    const failed = await bots[1].waitFor(m => m.type === 'round_failed' && m.poolId === p.poolId)
    expect(failed.missing).toEqual([`${silentPledge.txid}_0`])
    const before = (await get(`/pools/${p.poolId}`)).coordinator
    expect(before).toMatchObject({ lastRound: { round: 1, outcome: 'failed', missing: failed.missing } })
    expect(before.blacklist.map((b: any) => b.outpoint)).toEqual(failed.missing)

    for (const b of bots) b.close()
    await coop.close()
    coop = await startCoop()
    const after = (await get(`/pools/${p.poolId}`)).coordinator
    expect(after).toEqual({ ...before, signed: 0, total: 0 })
  })
})
