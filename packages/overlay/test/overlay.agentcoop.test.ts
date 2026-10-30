/**
 * B.P1: ls_agentcoop counts pools, pledges, cancellations and settlements from
 * chain records (plan/phases/B-P1.md §8). Mock chain, overlay over HTTP.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LockingScript } from '@bsv/sdk'
import type { Wallet } from '@bsv/wallet-toolbox'
import { startOverlay, type RunningOverlay } from '../src/server'
import { buildOpReturn } from '../src/stub/opreturn'
import { createMockChain, type MockChain } from './helpers/mockchain'
import { broadcastMock, buildSettlement, lookup, SCOPE_ALL, SCOPE_SINGLE_ACP, signInput, submitToOverlay } from './helpers/settlement'
import { beefOf, cancelPledge, openPool, pledge, withdrawPoolCredits, type OpenedPool, type Pledge } from './helpers/pool'

let chain: MockChain
let overlay: RunningOverlay
let provider: Wallet, a1: Wallet, a2: Wallet, a3: Wallet

const submit = async (atomicBeef: number[]): Promise<any> => {
  const { status, body } = await submitToOverlay(overlay.url, beefOf(atomicBeef))
  expect(status).toBe(200)
  return body.tm_agentcoop
}
const pool = async (poolId: string): Promise<any> => (await lookup(overlay.url, { op: 'pool', poolId }))[0]?.ctx
const pledges = async (poolId: string, extra: Record<string, unknown> = {}): Promise<any[]> =>
  (await lookup(overlay.url, { op: 'pledges', poolId, ...extra })).map(o => o.ctx)

beforeAll(async () => {
  chain = await createMockChain()
  const dir = mkdtempSync(join(tmpdir(), 'agentcoop-overlay-p1-'))
  overlay = await startOverlay({ port: 18191, dbFile: join(dir, 'overlay.db'), chainTracker: chain.chainTracker, quiet: true })
  ;[provider, a1, a2, a3] = await Promise.all([chain.makeWallet(), chain.makeWallet(), chain.makeWallet(), chain.makeWallet()])
  for (const w of [provider, a1, a2, a3]) await chain.fund(w)
})

afterAll(async () => {
  await overlay?.close()
  await chain?.close()
})

describe('ls_agentcoop: pools and pledges from chain records', () => {
  let p: OpenedPool
  let pl1: Pledge, pl2: Pledge, pl3: Pledge

  it('1. a pool record is indexed: open, 0 pledged, credit output matches terms', async () => {
    p = await openPool(provider)
    expect((await submit(p.deployTx)).outputsToAdmit).toEqual([0])
    const steak = await submit(p.poolTx)
    expect(steak.outputsToAdmit).toEqual([0, 1]) // credit UTXO + pool record
    const view = await pool(p.poolId)
    expect(view).toMatchObject({ poolId: p.poolId, status: 'open', pledgedCredits: '0', pledgeCount: 0, target: '1000' })
    expect(view.invalidReason).toBeUndefined()
    expect(view.terms).toMatchObject({ poolId: p.poolId, tokenId: p.terms.tokenId, priceSats: '4500' })
    expect((await lookup(overlay.url, { op: 'pools' })).map(o => o.ctx.poolId)).toContain(p.poolId)
  })

  it('2. two valid pledges count; a pledge with a short registration fee is listed as invalid and not counted', async () => {
    pl1 = await pledge(a1, p, 600n)
    pl2 = await pledge(a2, p, 400n)
    const bad = await pledge(a3, p, 100n, { feeSats: 50 })
    for (const x of [pl1, pl2, bad]) expect((await submit(x.tx)).outputsToAdmit).toEqual([0, 2]) // pledge coin + record
    expect(await pool(p.poolId)).toMatchObject({ pledgedCredits: '1000', pledgeCount: 2 })
    expect((await pledges(p.poolId)).map(x => x.outpoint).sort()).toEqual([`${pl1.txid}_0`, `${pl2.txid}_0`].sort())
    const all = await pledges(p.poolId, { includeInvalid: true })
    expect(all.find(x => x.txid === bad.txid)).toMatchObject({ valid: false, invalidReason: 'registration fee missing or below feeSats' })
  })

  it('3. a pledge that reaches the overlay before its pool still counts once the pool arrives', async () => {
    const q = await openPool(provider)
    await submit(q.deployTx)
    const early = await pledge(a1, q, 500n)
    await submit(early.tx)
    expect(await pool(q.poolId)).toBeUndefined()
    expect((await pledges(q.poolId, { includeInvalid: true }))[0]).toMatchObject({ valid: false, invalidReason: 'unknown pool' })
    await submit(q.poolTx)
    expect(await pool(q.poolId)).toMatchObject({ pledgedCredits: '500', pledgeCount: 1 })
  })

  it('4. T4: cancelling a pledge (spending its coin) lowers progress; the pledge stays as spent history', async () => {
    const steak = await submit(await cancelPledge(a2, pl2.coin))
    expect(steak.coinsToRetain).toEqual([0])
    expect(await pool(p.poolId)).toMatchObject({ pledgedCredits: '600', pledgeCount: 1 })
    const hist = await pledges(p.poolId, { includeSpent: true })
    expect(hist.find(x => x.txid === pl2.txid)).toMatchObject({ spent: true })
    pl3 = await pledge(a3, p, 400n)
    await submit(pl3.tx)
    expect(await pool(p.poolId)).toMatchObject({ pledgedCredits: '1000', pledgeCount: 2 })
  })

  it('6. a settle record that does not spend the pool at input 0 is ignored', async () => {
    const res = await a1.createAction({
      description: 'Fake settle record',
      outputs: [{ lockingScript: buildOpReturn('settle', { v: '1', poolId: p.poolId, pledgeListHash: 'ab'.repeat(32) }).toHex(), satoshis: 0, outputDescription: 'fake settle' }],
      options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
    })
    await submit(Array.from(res.tx!))
    expect(await pool(p.poolId)).toMatchObject({ status: 'open' })
    expect(await lookup(overlay.url, { op: 'settlement', poolId: p.poolId })).toEqual([])
  })

  it('5. T5: the settlement settles the pool; its pledges are spent by it', async () => {
    const parts = [{ w: a1, x: pl1 }, { w: a3, x: pl3 }].map(({ w, x }) => ({
      w,
      p: { coin: x.coin, identityKey: x.identityKey, credits: x.credits, share: Number(x.credits) * 4_500 / 1000, fee: 100 }
    }))
    const tx = buildSettlement({ offer: p.credit, tokenId: p.terms.tokenId, priceSats: 4_500, payScript: LockingScript.fromHex(p.terms.payScriptHex), participants: parts.map(x => x.p), poolId: p.poolId })
    tx.inputs[0].unlockingScript = await signInput(provider, tx, 0, p.credit.key, SCOPE_SINGLE_ACP)
    for (const [i, { w, p: part }] of parts.entries()) tx.inputs[i + 1].unlockingScript = await signInput(w, tx, i + 1, part.coin.key, SCOPE_ALL)
    await broadcastMock(chain.services, tx)
    const { body } = await submitToOverlay(overlay.url, tx.toBEEF())
    expect(body.tm_agentcoop.coinsToRetain).toEqual([0, 1, 2])
    const txid = tx.id('hex')
    expect(await pool(p.poolId)).toMatchObject({ status: 'settled', settledTxid: txid, pledgedCredits: '1000', pledgeCount: 2 })
    const [s] = await lookup(overlay.url, { op: 'settlement', poolId: p.poolId })
    expect(s.ctx).toMatchObject({ poolId: p.poolId, txid, inputs: [p.poolId, `${pl1.txid}_0`, `${pl3.txid}_0`] })
    const hist = await pledges(p.poolId, { includeSpent: true, includeInvalid: true })
    for (const x of [pl1, pl3]) expect(hist.find(h => h.txid === x.txid)).toMatchObject({ spent: true, spendingTxid: txid })
    expect((await lookup(overlay.url, { op: 'pools', status: 'settled' })).map(o => o.ctx.poolId)).toContain(p.poolId)
  })

  it('7. the provider spending the credit UTXO outside a settlement cancels the pool', async () => {
    const q = await openPool(provider)
    await submit(q.deployTx)
    await submit(q.poolTx)
    const x = await pledge(a1, q, 300n)
    await submit(x.tx)
    await submit(await withdrawPoolCredits(provider, q))
    expect(await pool(q.poolId)).toMatchObject({ status: 'cancelled', pledgedCredits: '0' })
    expect((await pledges(q.poolId, { includeInvalid: true }))[0]).toMatchObject({ valid: false, invalidReason: 'pool cancelled' })
  })
})
