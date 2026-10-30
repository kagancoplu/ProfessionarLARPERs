/**
 * B.P2 (plan/phases/B-P2.md §5): lock-in, signing rounds, blacklist, waiting
 * list, the 3-round limit, failed pools. Overlay + coordinator engine + WS
 * participant bots in one process; wallet-toolbox wallets on the mock chain.
 * Pledges are mined one per block so the coordinator order (height, txid) is
 * deterministic.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LockingScript, Transaction, UnlockingScript, type MerklePath } from '@bsv/sdk'
import type { Wallet } from '@bsv/wallet-toolbox'
import { startOverlay, type RunningOverlay } from '../../../packages/overlay/src/server'
import { createMockChain, type MockChain } from '../../../packages/overlay/test/helpers/mockchain'
import { lookup, SCOPE_SINGLE_ACP, signInput, submitToOverlay } from '../../../packages/overlay/test/helpers/settlement'
import { beefOf, openPool, pledge, type OpenedPool, type Pledge } from '../../../packages/overlay/test/helpers/pool'
import type { Offer } from '../../../packages/overlay/src/stub/types'
import { ManualHeight } from '../src/chain'
import { noSpentChecker } from '../src/spent'
import { startCoordinator, type RunningCoordinator } from '../src/server'
import { devProtocol } from './helpers/devProtocol'
import { startBot, type Bot } from './helpers/participant'

let chain: MockChain
let overlay: RunningOverlay
let coop: RunningCoordinator
const height = new ManualHeight(500)
const logs: any[] = []
let provider: Wallet
let w: Record<'a1' | 'a2' | 'a3' | 'a4' | 'a5' | 'a6', Wallet>
let bot: Record<'a1' | 'a2' | 'a3' | 'a4' | 'a5' | 'a6', Bot>

const get = async (path: string): Promise<any> => await (await fetch(`${coop.url}${path}`)).json()

async function newPool (opts: { deadlineHeight?: number } = {}): Promise<OpenedPool> {
  const p = await openPool(provider, opts)
  for (const tx of [p.deployTx, p.poolTx]) expect((await submitToOverlay(overlay.url, beefOf(tx))).status).toBe(200)
  return p
}

/** Pledge, mine it in its own block, submit with its merkle path (so the overlay knows its height). */
async function pledgeMined (name: keyof typeof w, p: OpenedPool, credits: bigint): Promise<Pledge> {
  const x = await pledge(w[name], p, credits)
  bot[name].addCoin(x.coin)
  await chain.mineBlock()
  const tx = Transaction.fromAtomicBEEF(x.tx)
  tx.merklePath = (await chain.services.getMerklePath(x.txid)).merklePath as MerklePath
  expect((await submitToOverlay(overlay.url, tx.toBEEF())).status).toBe(200)
  return x
}

async function postOffer (p: OpenedPool): Promise<void> {
  const tx = new Transaction()
  tx.addInput({ sourceTransaction: p.credit.sourceTransaction, sourceOutputIndex: 0, unlockingScript: new UnlockingScript([]), sequence: 0xffffffff })
  tx.addOutput({ lockingScript: LockingScript.fromHex(p.terms.payScriptHex), satoshis: Number(p.terms.priceSats) })
  const unlock = await signInput(provider, tx, 0, p.credit.key, SCOPE_SINGLE_ACP)
  const offer: Offer = { poolId: p.poolId, unlockingScriptHex: unlock.toHex(), lockingScriptHex: p.credit.lockingScript.toHex(), satoshis: 1, terms: p.terms }
  const res = await fetch(`${coop.url}/offers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(offer) })
  expect(res.status).toBe(201)
}

const credits = async (name: keyof typeof w, tokenId: string): Promise<string[]> =>
  (await lookup(overlay.url, { op: 'identity', identityKey: bot[name].identity, tokenId })).map(o => o.ctx.amt).sort()

const waitLog = async (pred: (l: any) => boolean, ms = 20_000): Promise<any> => {
  const end = Date.now() + ms
  for (;;) {
    const hit = logs.find(pred)
    if (hit !== undefined) return hit
    if (Date.now() > end) throw new Error(`no such log; got ${JSON.stringify(logs.map(l => l.event))}`)
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

beforeAll(async () => {
  chain = await createMockChain()
  const dir = mkdtempSync(join(tmpdir(), 'agentcoop-engine-'))
  overlay = await startOverlay({ port: 18390, dbFile: join(dir, 'overlay.db'), chainTracker: chain.chainTracker, quiet: true })
  coop = await startCoordinator(
    { port: 18391, overlayUrl: overlay.url, arcadeUrl: 'http://unused.invalid', dbFile: join(dir, 'coordinator.db'), pollMs: 200, roundTimeoutMs: 1_500, maxRounds: 3, spentCheck: 'none', network: 'main' },
    { height, protocol: devProtocol(chain.services), spent: noSpentChecker, log: (event, f) => { logs.push({ event, ...f }) } }
  )
  const names = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'] as const
  provider = await chain.makeWallet()
  w = Object.fromEntries(await Promise.all(names.map(async n => [n, await chain.makeWallet()]))) as typeof w
  for (const x of [provider, ...Object.values(w)]) await chain.fund(x)
  const behavior: Record<typeof names[number], { behavior?: () => 'sign' | 'silent' | 'reject' | 'garbage', delayMs?: number }> = {
    a1: { delayMs: 400 }, a2: {}, a3: { behavior: () => 'silent' }, a4: {}, a5: { behavior: () => 'garbage' }, a6: { behavior: () => 'reject' }
  }
  bot = Object.fromEntries(await Promise.all(names.map(async n => [n, await startBot(coop.url, w[n], behavior[n])]))) as typeof bot
})

afterAll(async () => {
  for (const b of Object.values(bot ?? {})) b.close()
  await coop?.close()
  await overlay?.close()
  await chain?.close()
})

describe('coordinator engine: rounds, blacklist, waiting list', () => {
  it('1+6. happy path: one round settles; a signature for someone else\'s input is refused', async () => {
    const p = await newPool()
    const x1 = await pledgeMined('a1', p, 600n)
    await pledgeMined('a2', p, 400n)
    await postOffer(p)
    const req = await bot.a2.waitFor(m => m.type === 'sign_request' && m.poolId === p.poolId)
    const a1Input = 1 + req.plan.participants.findIndex((q: any) => q.outpoint === `${x1.txid}_0`)
    bot.a2.ws.send(JSON.stringify({ type: 'sign_response', poolId: p.poolId, round: req.round, inputIndex: a1Input, unlockingScriptHex: '00' }))
    expect(await bot.a2.waitFor(m => m.type === 'error' && m.poolId === p.poolId)).toMatchObject({ error: 'input belongs to another participant' })

    const settled = await bot.a1.waitFor(m => m.type === 'settled' && m.poolId === p.poolId)
    const view = await get(`/pools/${p.poolId}`)
    expect(view).toMatchObject({ status: 'settled', settledTxid: settled.txid, coordinator: { lastRound: { round: 1, outcome: 'settled', txid: settled.txid } } })
    expect(await credits('a1', p.terms.tokenId)).toEqual(['600'])
    expect(await credits('a2', p.terms.tokenId)).toEqual(['400'])
  })

  it('2. waiting list: the silent first pledge is blacklisted; round 2 settles with a partial last share', async () => {
    const p = await newPool()
    const silent = await pledgeMined('a3', p, 400n)
    await pledgeMined('a1', p, 600n)
    await pledgeMined('a2', p, 300n)
    await pledgeMined('a4', p, 200n)
    await postOffer(p)
    const failed = await bot.a1.waitFor(m => m.type === 'round_failed' && m.poolId === p.poolId)
    expect(failed).toMatchObject({ round: 1, missing: [`${silent.txid}_0`] })
    const settled = await bot.a4.waitFor(m => m.type === 'settled' && m.poolId === p.poolId)
    const view = await get(`/pools/${p.poolId}`)
    expect(view.coordinator).toMatchObject({ lastRound: { round: 2, outcome: 'settled', txid: settled.txid }, blacklist: [{ outpoint: `${silent.txid}_0`, reason: 'timeout' }] })
    expect(await credits('a1', p.terms.tokenId)).toEqual(['600'])
    expect(await credits('a2', p.terms.tokenId)).toEqual(['300'])
    expect(await credits('a4', p.terms.tokenId)).toEqual(['100'])
    expect(await credits('a3', p.terms.tokenId)).toEqual([])
  })

  it('3. a bad signature and a sign_reject are blacklisted with their reasons', async () => {
    const p = await newPool()
    const garbage = await pledgeMined('a5', p, 300n)
    const rejecter = await pledgeMined('a6', p, 300n)
    await pledgeMined('a1', p, 600n)
    await pledgeMined('a4', p, 400n)
    await postOffer(p)
    await bot.a4.waitFor(m => m.type === 'settled' && m.poolId === p.poolId)
    const view = await get(`/pools/${p.poolId}`)
    expect(view.coordinator.lastRound).toMatchObject({ round: 2, outcome: 'settled' })
    expect(view.coordinator.blacklist).toEqual(expect.arrayContaining([
      { outpoint: `${garbage.txid}_0`, reason: 'bad signature' },
      { outpoint: `${rejecter.txid}_0`, reason: 'rejected: policy' }
    ]))
    expect(logs.some(l => l.event === 'sign_bad' && l.poolId === p.poolId)).toBe(true)
  })

  it('4. after 3 failed rounds the coordinator gives up and the pool stays open', async () => {
    const p = await newPool()
    for (let i = 0; i < 8; i++) await pledgeMined('a3', p, 500n) // always silent
    await postOffer(p)
    await waitLog(l => l.event === 'gave_up' && l.poolId === p.poolId, 30_000)
    await new Promise(resolve => setTimeout(resolve, 1_000))
    expect(logs.filter(l => l.event === 'round_start' && l.poolId === p.poolId).map(l => l.round)).toEqual([1, 2, 3])
    const view = await get(`/pools/${p.poolId}`)
    expect(view).toMatchObject({ status: 'open', coordinator: { lastRound: { round: 3, outcome: 'failed' } } })
    expect(view.coordinator.blacklist).toHaveLength(6)
    expect(logs.some(l => l.event === 'broadcast' && l.poolId === p.poolId)).toBe(false)
  })

  it('5. an unfilled pool past its deadline: pool_failed once, no round, no broadcast', async () => {
    const p = await newPool({ deadlineHeight: 700 })
    await pledgeMined('a4', p, 500n)
    await postOffer(p)
    height.value = 700
    await bot.a4.waitFor(m => m.type === 'pool_failed' && m.poolId === p.poolId)
    await new Promise(resolve => setTimeout(resolve, 1_000))
    expect(bot.a4.messages.filter(m => m.type === 'pool_failed' && m.poolId === p.poolId)).toHaveLength(1)
    expect((await get(`/pools/${p.poolId}`)).status).toBe('failed')
    expect(logs.some(l => l.event === 'round_start' && l.poolId === p.poolId)).toBe(false)
  })
})
