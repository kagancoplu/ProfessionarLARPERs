/**
 * Validation test 1 (FINAL-IDEA §12.1, plan/phases/B-P0.md §4):
 * does the overlay admit a settlement whose inputs mix the provider's credit
 * UTXO (signed SINGLE|ANYONECANPAY|FORKID) with plain pledge coins (signed
 * ALL|FORKID), and whose outputs mix the provider payment, BSV-21 credit
 * transfers, change and an OP_RETURN?
 *
 * Real wallet-toolbox wallets on the mock chain; the overlay runs over HTTP
 * and verifies SPV + every script on submit.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Transaction, UnlockingScript } from '@bsv/sdk'
import type { Wallet } from '@bsv/wallet-toolbox'
import { startOverlay, type RunningOverlay } from '../src/server'
import { createMockChain, type MockChain } from './helpers/mockchain'
import {
  SCOPE_ALL,
  SCOPE_SINGLE_ACP,
  broadcastMock,
  buildSettlement,
  deployCredits,
  inputIsValid,
  lookup,
  makePledgeCoin,
  providerPayScript,
  signInput,
  submitToOverlay,
  type Coin,
  type SettlementParticipant
} from './helpers/settlement'
import { settlementBytes } from '../scripts/settlementSize'

let chain: MockChain
let overlay: RunningOverlay
let provider: Wallet, agent1: Wallet, agent2: Wallet, agent3: Wallet

beforeAll(async () => {
  chain = await createMockChain()
  const dir = mkdtempSync(join(tmpdir(), 'agentcoop-overlay-'))
  overlay = await startOverlay({ port: 18190, dbFile: join(dir, 'overlay.db'), chainTracker: chain.chainTracker, quiet: true })
  ;[provider, agent1, agent2, agent3] = await Promise.all([chain.makeWallet(), chain.makeWallet(), chain.makeWallet(), chain.makeWallet()])
  for (const w of [provider, agent1, agent2, agent3]) await chain.fund(w)
})

afterAll(async () => {
  await overlay?.close()
  await chain?.close()
})

/** Sign in0 as the provider (SINGLE|ACP) and every other input as its participant (ALL). */
async function signAll (tx: Transaction, offer: Coin, parts: Array<{ wallet: Wallet, p: SettlementParticipant }>, providerUnlock?: UnlockingScript): Promise<UnlockingScript> {
  const unlock0 = providerUnlock ?? await signInput(provider, tx, 0, offer.key, SCOPE_SINGLE_ACP)
  const scripts = [unlock0]
  for (const [i, { wallet, p }] of parts.entries()) scripts.push(await signInput(wallet, tx, i + 1, p.coin.key, SCOPE_ALL))
  scripts.forEach((s, i) => { tx.inputs[i].unlockingScript = s })
  return unlock0
}

describe('validation test 1: overlay admits a mixed DvP settlement', () => {
  let tokenId: string
  let offer: Coin
  let settlement: Transaction
  let providerUnlock: UnlockingScript
  let parts: Array<{ wallet: Wallet, p: SettlementParticipant }>
  let payScript: Awaited<ReturnType<typeof providerPayScript>>
  const N = 1000n
  const PRICE = 4_500

  it('T1: the credit deploy is admitted to tm_agentcoop', async () => {
    const d = await deployCredits(provider, N)
    tokenId = d.tokenId
    offer = d.coin
    const { status, body } = await submitToOverlay(overlay.url, offer.sourceTransaction.toBEEF())
    expect(status).toBe(200)
    expect(body.tm_agentcoop.outputsToAdmit).toEqual([offer.vout])
  })

  it('T5: 1 credit input (SINGLE|ACP) + 3 pledge inputs (ALL) → payment, 3 credit outputs, change, OP_RETURN', async () => {
    payScript = await providerPayScript(provider, 'pool-test-1')
    const ids = await Promise.all([agent1, agent2, agent3].map(async w => (await w.getPublicKey({ identityKey: true })).publicKey))
    const coins = await Promise.all([makePledgeCoin(agent1, 3_000), makePledgeCoin(agent2, 2_000), makePledgeCoin(agent3, 1_000)])
    const credits = [600n, 300n, 100n]
    parts = [agent1, agent2, agent3].map((wallet, i) => ({
      wallet,
      p: { coin: coins[i], identityKey: ids[i], credits: credits[i], share: Number(credits[i]) * PRICE / Number(N), fee: 100 }
    }))
    settlement = buildSettlement({ offer, tokenId, priceSats: PRICE, payScript, participants: parts.map(x => x.p), poolId: tokenId })
    providerUnlock = await signAll(settlement, offer, parts)
    for (let i = 0; i < settlement.inputs.length; i++) expect(inputIsValid(settlement, i)).toBe(true)

    await broadcastMock(chain.services, settlement) // Arcade stand-in: accepts the scripts
    const { status, body } = await submitToOverlay(overlay.url, settlement.toBEEF())
    console.log('[validation 1] settlement', settlement.id('hex'), 'bytes', settlement.toBinary().length, 'STEAK', JSON.stringify(body))
    expect(status).toBe(200)
    expect(body.tm_agentcoop.outputsToAdmit).toEqual([1, 2, 3]) // only the credit outputs
    expect(body.tm_agentcoop.coinsToRetain).toEqual([0]) // the provider's credit input, kept as history
  })

  it('lookup: each participant holds its credits; the offer UTXO is spent by the settlement', async () => {
    const txid = settlement.id('hex')
    for (const { p } of parts) {
      const held = await lookup(overlay.url, { op: 'identity', identityKey: p.identityKey, tokenId })
      expect(held.map(o => [o.txid, o.ctx.amt])).toEqual([[txid, p.credits.toString()]])
    }
    const [spent] = await lookup(overlay.url, { op: 'outpoint', txid: offer.sourceTransaction.id('hex'), vout: offer.vout })
    expect(spent.ctx).toMatchObject({ spent: true, spendingTxid: txid })
    const history = await lookup(overlay.url, { op: 'history', tokenId })
    expect(history.filter(o => !o.ctx.spent).reduce((s, o) => s + BigInt(o.ctx.amt), 0n)).toBe(N) // supply conserved
  })

  it('size model matches the real settlement (validation test 8 model)', () => {
    const real = settlement.toBinary().length
    const model = settlementBytes({ p2pkh: 3 })
    expect(Math.abs(model - real) / real).toBeLessThan(0.02)
  })

  it('1b: the provider signs once; the same SINGLE|ACP signature is valid for a re-planned round', async () => {
    // Round 2: different participants, order, shares and change. Output 0 unchanged.
    const coins = await Promise.all([makePledgeCoin(agent3, 4_000), makePledgeCoin(agent1, 2_500)])
    const ids = await Promise.all([agent3, agent1].map(async w => (await w.getPublicKey({ identityKey: true })).publicKey))
    const round2 = buildSettlement({
      offer,
      tokenId,
      priceSats: PRICE,
      payScript,
      participants: [
        { coin: coins[0], identityKey: ids[0], credits: 700n, share: 3_150, fee: 150 },
        { coin: coins[1], identityKey: ids[1], credits: 300n, share: 1_350, fee: 150 }
      ],
      poolId: tokenId
    })
    round2.inputs[0].unlockingScript = providerUnlock // round 1's signature, reused
    expect(inputIsValid(round2, 0)).toBe(true)
  })

  it('1c: the coordinator cannot lower the provider payment', () => {
    const tampered = buildSettlement({ offer, tokenId, priceSats: PRICE - 1, payScript, participants: parts.map(x => x.p), poolId: tokenId })
    tampered.inputs[0].unlockingScript = providerUnlock
    expect(inputIsValid(tampered, 0)).toBe(false)
  })

  it('1d: inflation inside a mixed settlement is not admitted', async () => {
    const d = await deployCredits(provider, N, 'GPUB')
    expect((await submitToOverlay(overlay.url, d.coin.sourceTransaction.toBEEF())).body.tm_agentcoop.outputsToAdmit).toEqual([d.coin.vout])
    const coin = await makePledgeCoin(agent1, 6_000)
    const p = { coin, identityKey: (await agent1.getPublicKey({ identityKey: true })).publicKey, credits: N + 1n, share: PRICE, fee: 100 }
    const tx = buildSettlement({ offer: d.coin, tokenId: d.tokenId, priceSats: PRICE, payScript, participants: [p], poolId: d.tokenId })
    await signAll(tx, d.coin, [{ wallet: agent1, p }])
    await broadcastMock(chain.services, tx) // miners do not check BSV-21
    const { body } = await submitToOverlay(overlay.url, tx.toBEEF())
    expect(body.tm_agentcoop.outputsToAdmit).toEqual([])
    expect(body.tm_agentcoop.coinsToRetain).toEqual([0]) // the credits are consumed (burned)
    expect(await lookup(overlay.url, { op: 'outpoint', txid: tx.id('hex'), vout: 1 })).toEqual([])
  })

  it('1e: a credit input the overlay never admitted gets the whole settlement refused', async () => {
    const d = await deployCredits(provider, N, 'GPUC') // never submitted to the overlay
    const coin = await makePledgeCoin(agent2, 6_000)
    const p = { coin, identityKey: (await agent2.getPublicKey({ identityKey: true })).publicKey, credits: N, share: PRICE, fee: 100 }
    const tx = buildSettlement({ offer: d.coin, tokenId: d.tokenId, priceSats: PRICE, payScript, participants: [p], poolId: d.tokenId })
    await signAll(tx, d.coin, [{ wallet: agent2, p }])
    await broadcastMock(chain.services, tx)
    const { status, body } = await submitToOverlay(overlay.url, tx.toBEEF())
    console.log('[validation 1e] status', status, 'body', JSON.stringify(body))
    expect(body.tm_agentcoop?.outputsToAdmit ?? []).toEqual([])
    expect(await lookup(overlay.url, { op: 'outpoint', txid: tx.id('hex'), vout: 1 })).toEqual([])
  })
})
