/**
 * D-P3 §9.2: one Coop Rail swap end to end, offline. USDC on an in-memory EVM
 * (the real AgentCoopHTLC bytecode) → BSV on wallet-toolbox's mock chain (every
 * script verified) → straight into the agent's Mandate Vault, with the guard
 * co-signing the claim (kind:'rail'). Then the refund path and the refusals.
 */
import { createHash, randomBytes } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AuthFetch, P2PKH, PrivateKey, Transaction, Utils } from '@agentcoop/core/sdk'
import { inputScriptValid } from '@agentcoop/core'
import { newSwapId, parseHtlcLockingScript, RAIL_REFUND_SEQUENCE } from '@agentcoop/core/scripts/htlc'
import { CosignRejected, httpCosigner, listVaultUtxos, type Cosigner } from '@agentcoop/core/signers/VaultSigner'
import type { Wallet } from '@bsv/wallet-toolbox'
import { getAddress, type Address, type Hex } from 'viem'
import { Guard } from '../apps/guard/src/guard'
import { createGuardApp } from '../apps/guard/src/server'
import { createVault, putPolicy, registerVault, withdrawVault, type VaultInfo } from '../apps/owner-cli/src/vault-ops'
import { claimUsdc, deployHtlc, deployMockUsdc, getLock, lockUsdc, USDC_ABI, usdcBalance } from '../apps/maker/src/base'
import { MemoryEvm } from '../apps/maker/src/evm'
import {
  broadcastFunding, buildRefund, checkAndSignRefund, claimHtlc, completeRefund, DEFAULT_REFUND_BLOCKS, extractSecret, fundHtlc,
  makerRefundScript, quote, verifyBaseLock, type Funding, type SwapKeys
} from '../apps/maker/src/rail'
import { poolBalance } from '../scripts/lib/funding'
import { createMockChain, type MockChain } from './helpers/mockchain'
import { broadcastMock } from '../packages/overlay/test/helpers/settlement'

const AGENT_EVM: Address = getAddress('0x00000000000000000000000000000000000a6e17')
const MAKER_EVM: Address = getAddress('0x000000000000000000000000000000000000ba5e')
const SATS_PER_USDC = 2_000 // test rate (whole USDC); the live rate is RAIL_SATS_PER_USDC

let chain: MockChain
let owner: Wallet, agent: Wallet, maker: Wallet, guardWallet: Wallet, stranger: Wallet
let guard: Guard
let server: Server
let cosign: Cosigner
let vault: VaultInfo
let evm: MemoryEvm
let usdc: Address, htlc: Address
const logs: string[] = []

const fetchTx = async (txid: string): Promise<Transaction> =>
  Transaction.fromBinary(Array.from((await (chain.services as any).storage.getTransaction(txid)).rawTx as number[]))
const newSecret = (): { secret: number[], hash: string } => {
  const secret = Array.from(randomBytes(32))
  return { secret, hash: createHash('sha256').update(Buffer.from(secret)).digest('hex') }
}
const refusal = async (p: Promise<unknown>): Promise<string> => {
  try { await p } catch (e) { if (e instanceof CosignRejected) return e.reason; throw e }
  throw new Error('expected the guard to refuse')
}

beforeAll(async () => {
  chain = await createMockChain()
  ;[owner, agent, maker, guardWallet, stranger] = await Promise.all(Array.from({ length: 5 }, async () => await chain.makeWallet()))
  await chain.fund(maker, 50_000)
  await chain.fund(agent, 10_000)
  await chain.fund(stranger, 10_000)
  guard = await Guard.create({ wallet: guardWallet, fetchTx, log: l => logs.push(l) })
  server = createGuardApp(guard, guardWallet).listen(0)
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  cosign = httpCosigner(url)
  vault = await createVault(owner, { agent: agent.identityKey, guard: guardWallet.identityKey })
  await registerVault(new AuthFetch(owner), url, vault)
  await putPolicy(new AuthFetch(owner), url, agent.identityKey, { allowProviders: [], maxPerPoolSats: 0, weeklyCapSats: 0, maxFeeSats: 500, hotWalletDailySats: 0 })

  evm = await MemoryEvm.create()
  usdc = await deployMockUsdc(evm, MAKER_EVM)
  htlc = await deployHtlc(evm, MAKER_EVM)
  await evm.write(AGENT_EVM, usdc, USDC_ABI, 'mint', [AGENT_EVM, 2_000_000n])
}, 120_000)

afterAll(async () => {
  server?.close()
  await chain?.close()
})

describe('Coop Rail: USDC (Base) → BSV into the agent\'s vault', () => {
  const swapKeys = (hash: string): SwapKeys => ({ swapId: newSwapId(), hash, agent: agent.identityKey, guard: guardWallet.identityKey, maker: maker.identityKey })

  it('happy path: Base lock → v1 funding (not sent) → pre-signed refund → funding sent → agent + guard claim into the vault → maker takes the USDC', async () => {
    const { secret, hash } = newSecret()
    const k = swapKeys(hash)
    const q = quote(500_000n, SATS_PER_USDC) // 0.5 USDC
    expect(q.sats).toBe(985) // 1,000 − 1.5 % spread

    // 1 Base: the agent locks the USDC for the maker under sha256(secret)
    const { id } = await lockUsdc(evm, { htlc, token: usdc, from: AGENT_EVM, receiver: MAKER_EVM, amount: q.usdc, hashlock: `0x${hash}`, timeout: (await evm.now()) + 6n * 3600n })
    // 2 BSV: the maker checks the lock, funds the HTLC (version 1) but does not send it yet
    await verifyBaseLock(evm, { htlc, id, maker: MAKER_EVM, token: usdc, minAmount: q.usdc, hash })
    const funding = await fundHtlc(maker, k, q.sats)
    const ftx = Transaction.fromAtomicBEEF(funding.tx)
    expect(ftx.version).toBe(1)
    expect(parseHtlcLockingScript(ftx.outputs[funding.vout].lockingScript)).not.toBeNull()
    await expect(fetchTx(funding.txid)).rejects.toThrow() // not on chain yet

    // 3 the refund: nLockTime = height + k, sequence enforces it; the agent signs it, the maker completes it
    const height = await chain.services.getHeight()
    const refund = buildRefund(funding, await makerRefundScript(maker, k.swapId), height + DEFAULT_REFUND_BLOCKS)
    const sigA = await checkAndSignRefund(agent, refund, { funding, keys: k, minLockHeight: height + DEFAULT_REFUND_BLOCKS })
    const complete = await completeRefund(maker, refund, sigA, k)
    expect(complete.version).toBe(1)
    expect(complete.lockTime).toBe(height + DEFAULT_REFUND_BLOCKS)
    expect(complete.inputs[0].sequence).toBe(RAIL_REFUND_SEQUENCE)
    expect(inputScriptValid(complete, 0)).toBe(true) // the ELSE branch verifies (nLockTime itself: validation test 4, mainnet)

    // 4 the maker sends the funding; its txid is the one the refund spends
    await broadcastFunding(maker, funding)
    expect((await fetchTx(funding.txid)).id('hex')).toBe(funding.txid)

    // 5 the agent claims with the secret, the guard co-signs (kind:'rail'): the BSV lands in the vault
    const claim = await claimHtlc(agent, { funding, keys: k, secret, vaultId: vault.record.vaultId, vaultScriptHex: vault.lockingScriptHex, cosign })
    expect(logs.at(-1)).toMatch(/ALLOW rail .* inflow=985/)
    expect((await listVaultUtxos(agent, vault.record.vaultId)).map(u => u.satoshis)).toEqual([985])
    expect(guard.store.spentInWindow(owner.identityKey, agent.identityKey, Date.now())).toBe(0) // an inflow uses no cap

    // 6 the maker reads the secret from the claim and takes the USDC on Base
    const revealed = extractSecret(Transaction.fromAtomicBEEF(claim.tx), funding, hash)
    expect(revealed).toBe(`0x${Utils.toHex(secret)}`)
    await claimUsdc(evm, { htlc, from: MAKER_EVM, id, secret: revealed })
    expect(await usdcBalance(evm, usdc, MAKER_EVM)).toBe(500_000n)
    expect((await getLock(evm, htlc, id)).state).toBe('claimed')

    // and the vault stays the owner's: withdrawn alone through the OP_IF branch
    const before = (await poolBalance(owner)).spendableSatoshis
    await withdrawVault(owner, vault, await listVaultUtxos(agent, vault.record.vaultId))
    expect((await poolBalance(owner)).spendableSatoshis - before).toBeGreaterThan(900)
  })

  let pending: { funding: Funding, k: SwapKeys, secret: number[] }
  it('the agent refuses a refund it should not sign; the guard refuses claims that skip the vault or belong to someone else', async () => {
    const { secret, hash } = newSecret()
    const k = swapKeys(hash)
    const funding = await fundHtlc(maker, k, 700)
    const height = await chain.services.getHeight()
    const early = buildRefund(funding, await makerRefundScript(maker, k.swapId), height + 1)
    await expect(checkAndSignRefund(agent, early, { funding, keys: k, minLockHeight: height + DEFAULT_REFUND_BLOCKS })).rejects.toThrow(/earlier than/)
    const noLock = buildRefund(funding, await makerRefundScript(maker, k.swapId), height + DEFAULT_REFUND_BLOCKS)
    noLock.inputs[0].sequence = 0xffffffff
    await expect(checkAndSignRefund(agent, noLock, { funding, keys: k, minLockHeight: height + DEFAULT_REFUND_BLOCKS })).rejects.toThrow(/sequence/)
    await broadcastFunding(maker, funding)
    pending = { funding, k, secret }

    // the claim pays the agent's own wallet instead of its vault
    const own = new P2PKH().lock(PrivateKey.fromRandom().toPublicKey().toAddress()).toHex()
    expect(await refusal(claimHtlc(agent, { funding, keys: k, secret, vaultId: vault.record.vaultId, vaultScriptHex: own, cosign }))).toBe('rail funds must land in the vault')
    // someone else (with a vault of its own elsewhere or not) cannot use this swap's guard key
    expect(await refusal(claimHtlc(stranger, { funding, keys: k, secret, vaultId: vault.record.vaultId, vaultScriptHex: vault.lockingScriptHex, cosign }))).toBe('agent mismatch')
    expect((await listVaultUtxos(agent, vault.record.vaultId)).map(u => u.satoshis)).not.toContain(700) // nothing claimed
  })

  it('refund path: the agent never claims; the maker\'s pre-signed refund is valid and spends the HTLC back', async () => {
    const { funding, k } = pending
    const height = await chain.services.getHeight()
    const refund = buildRefund(funding, await makerRefundScript(maker, k.swapId), height + DEFAULT_REFUND_BLOCKS)
    const complete = await completeRefund(maker, refund, await checkAndSignRefund(agent, refund, { funding, keys: k, minLockHeight: height + DEFAULT_REFUND_BLOCKS }), k)
    expect(inputScriptValid(complete, 0)).toBe(true)
    // the mock chain does not enforce nLockTime; on mainnet this waits for height + k (validation test 4)
    await broadcastMock(chain.services, complete)
    expect((await fetchTx(complete.id('hex'))).outputs[0].satoshis).toBe(650)
  })
})
