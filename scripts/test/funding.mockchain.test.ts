/**
 * D-P0 §8 scenarios 1–6: the funding path of scripts/fund.ts and
 * scripts/receive.ts on wallet-toolbox's mock chain (no block is mined
 * between payment and spend).
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Wallet } from '@bsv/wallet-toolbox'
import { createMockChain, type MockChain } from './helpers/mockchain'
import {
  acceptPayment,
  loadPaymentFile,
  markAccepted,
  payTarget,
  pendingPaymentFiles,
  poolBalance,
  savePaymentFile
} from '../lib/funding'

describe('funding (mock chain)', () => {
  let chain: MockChain
  let treasury: Wallet
  let agent1: Wallet
  let agent2: Wallet
  let dir: string

  const target = (name: string, w: Wallet) => ({ name, identityKey: w.identityKey })

  beforeAll(async () => {
    chain = await createMockChain()
    treasury = await chain.makeWallet()
    agent1 = await chain.makeWallet()
    agent2 = await chain.makeWallet()
    await chain.fund(treasury, 1_000_000)
    dir = mkdtempSync(join(tmpdir(), 'agentcoop-payments-'))
  })

  afterAll(async () => {
    await chain.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('1. funds two server wallets with exact amounts', async () => {
    const p1 = await payTarget(treasury, target('agent-1', agent1), 50_000)
    await acceptPayment(agent1, p1, chain.chainTracker)
    const p2 = await payTarget(treasury, target('agent-2', agent2), 30_000)
    await acceptPayment(agent2, p2, chain.chainTracker)

    expect((await poolBalance(agent1)).spendableSatoshis).toBe(50_000)
    expect((await poolBalance(agent2)).spendableSatoshis).toBe(30_000)
  })

  it('2. a funded wallet spends at once, before any block (0-conf)', async () => {
    const p = await payTarget(agent1, target('agent-2', agent2), 10_000)
    await acceptPayment(agent2, p, chain.chainTracker)

    expect((await poolBalance(agent2)).spendableSatoshis).toBe(40_000)
    expect((await poolBalance(agent1)).spendableSatoshis).toBeLessThan(40_000) // 10k + fee left agent-1
  })

  it('3. a payment for agent-1 cannot be accepted by agent-2', async () => {
    const p = await payTarget(treasury, target('agent-1', agent1), 1_000)
    await expect(acceptPayment(agent2, p, chain.chainTracker)).rejects.toThrow(/not for this wallet/)
    // even with the target field forged, the locking script does not match agent-2's key
    await expect(acceptPayment(agent2, { ...p, targetIdentityKey: agent2.identityKey }, chain.chainTracker)).rejects.toThrow(/not locked to our key/)
    await acceptPayment(agent1, p, chain.chainTracker)
  })

  it('4. a payment claiming more than it is worth is refused', async () => {
    const p = await payTarget(treasury, target('agent-2', agent2), 2_000)
    await expect(acceptPayment(agent2, { ...p, satoshis: 2_001 }, chain.chainTracker)).rejects.toThrow(/not 2001/)
  })

  it('5. a payment survives the round trip through data/payments (receive.ts path)', async () => {
    const before = (await poolBalance(agent2)).spendableSatoshis
    const p = await payTarget(treasury, target('agent-2', agent2), 5_000)
    const file = savePaymentFile(dir, p)
    expect(pendingPaymentFiles(dir)).toContain(file)

    await acceptPayment(agent2, loadPaymentFile(file), chain.chainTracker)
    markAccepted(file)

    expect(pendingPaymentFiles(dir)).not.toContain(file)
    expect((await poolBalance(agent2)).spendableSatoshis).toBe(before + 5_000)
  })

  it('6. accepting the same payment twice does not count it twice', async () => {
    const p = await payTarget(treasury, target('agent-1', agent1), 3_000)
    await acceptPayment(agent1, p, chain.chainTracker)
    const once = (await poolBalance(agent1)).spendableSatoshis
    const second = await acceptPayment(agent1, p, chain.chainTracker)
      .then(() => 'accepted again (idempotent)', (e: Error) => `refused: ${e.message}`)
    console.info(`re-accepting a funding payment: ${second}`)
    expect((await poolBalance(agent1)).spendableSatoshis).toBe(once)
  })

  it('rejects zero, negative and fractional amounts before touching the wallet', async () => {
    for (const sats of [0, -1, 1.5]) {
      await expect(payTarget(treasury, target('agent-1', agent1), sats)).rejects.toThrow(/invalid amount/)
    }
  })
})
