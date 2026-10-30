/**
 * `runSwap` (src/swap.ts), the call `swap-demo.ts` makes on mainnet + Base Sepolia, run
 * offline: in-memory EVM with the real AgentCoopHTLC bytecode, wallet-toolbox mock chain,
 * the real guard. Checks the step order the demo prints, the PoC caps, and that a caller
 * that stops after `refund_ready` holds a refund that spends the HTLC back to the maker.
 */
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AuthFetch, Transaction } from '@agentcoop/core/sdk'
import { inputScriptValid } from '@agentcoop/core'
import { httpCosigner, listVaultUtxos, type Cosigner } from '@agentcoop/core/signers/VaultSigner'
import type { Wallet } from '@bsv/wallet-toolbox'
import { getAddress, type Address } from 'viem'
import { Guard } from '../../guard/src/guard'
import { createGuardApp } from '../../guard/src/server'
import { createVault, putPolicy, registerVault, type VaultInfo } from '../../owner-cli/src/vault-ops'
import { deployHtlc, deployMockUsdc, getLock, USDC_ABI, usdcBalance } from '../src/base'
import { MemoryEvm } from '../src/evm'
import { MAX_SWAP_SATS, runSwap, type SwapParties, type SwapStep } from '../src/swap'
import { createMockChain, type MockChain } from '../../../test/helpers/mockchain'

const AGENT_EVM: Address = getAddress('0x00000000000000000000000000000000000a6e17')
const MAKER_EVM: Address = getAddress('0x000000000000000000000000000000000000ba5e')

let chain: MockChain
let owner: Wallet, agent: Wallet, maker: Wallet, guardWallet: Wallet
let server: Server
let cosign: Cosigner
let vault: VaultInfo
let evm: MemoryEvm
let parties: SwapParties

const fetchTx = async (txid: string): Promise<Transaction> =>
  Transaction.fromBinary(Array.from((await (chain.services as any).storage.getTransaction(txid)).rawTx as number[]))

beforeAll(async () => {
  chain = await createMockChain()
  ;[owner, agent, maker, guardWallet] = await Promise.all(Array.from({ length: 4 }, async () => await chain.makeWallet()))
  await chain.fund(maker, 50_000)
  await chain.fund(agent, 10_000)
  const guard = await Guard.create({ wallet: guardWallet, fetchTx, log: () => {} })
  server = createGuardApp(guard, guardWallet).listen(0)
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  cosign = httpCosigner(url)
  vault = await createVault(owner, { agent: agent.identityKey, guard: guardWallet.identityKey })
  await registerVault(new AuthFetch(owner), url, vault)
  await putPolicy(new AuthFetch(owner), url, agent.identityKey, { allowProviders: [], maxPerPoolSats: 0, weeklyCapSats: 0, maxFeeSats: 500, hotWalletDailySats: 0 })

  evm = await MemoryEvm.create()
  const usdc = await deployMockUsdc(evm, MAKER_EVM)
  const htlc = await deployHtlc(evm, MAKER_EVM)
  await evm.write(AGENT_EVM, usdc, USDC_ABI, 'mint', [AGENT_EVM, 2_000_000n])
  parties = {
    evm, htlc, usdc, agentEvm: AGENT_EVM, makerEvm: MAKER_EVM, agent, maker,
    agentIdentity: agent.identityKey, makerIdentity: maker.identityKey, guardIdentity: guardWallet.identityKey,
    cosign, vault: { vaultId: vault.record.vaultId, lockingScriptHex: vault.lockingScriptHex },
    height: async () => await chain.services.getHeight()
  }
}, 120_000)

afterAll(async () => {
  server?.close()
  await chain?.close()
})

describe('runSwap: the swap-demo steps, offline', () => {
  it('0.4 USDC → 788 sat in the vault; every step reported in order; the maker holds the USDC', async () => {
    const steps: SwapStep[] = []
    const r = await runSwap(parties, { amount: 400_000n, satsPerUsdc: 2_000, onStep: s => { steps.push(s) } })
    expect(steps.map(s => s.step)).toEqual(['quote', 'base_locked', 'funding_signed', 'refund_ready', 'funding_sent', 'claimed', 'base_claimed'])
    expect(r.sats).toBe(788) // 800 − 1.5 % spread
    expect((await fetchTx(r.fundingTxid)).version).toBe(1)
    expect((await fetchTx(r.claimTxid)).outputs.find(o => o.lockingScript.toHex() === vault.lockingScriptHex)?.satoshis).toBe(788)
    expect((await listVaultUtxos(agent, vault.record.vaultId)).map(u => u.satoshis)).toContain(788)
    expect(await usdcBalance(evm, parties.usdc, MAKER_EVM)).toBe(400_000n)
    expect((await getLock(evm, parties.htlc, r.baseLockId)).state).toBe('claimed')
    expect(r.refundLockTime).toBe(await chain.services.getHeight() + 6)
  })

  it('the refund handed out at refund_ready spends the HTLC back to the maker (recovery if the caller stops there)', async () => {
    let refundHex: string | undefined
    await runSwap(parties, { amount: 200_000n, satsPerUsdc: 2_000, onStep: s => { if (s.step === 'refund_ready') refundHex = s.rawHex } })
    const refund = Transaction.fromHex(refundHex!)
    expect(refund.version).toBe(1)
    expect(refund.inputs[0].sequence).toBe(0xfffffffe)
    // the refund's input is the funding's HTLC: attach its source and check the ELSE branch verifies
    refund.inputs[0].sourceTransaction = await fetchTx(refund.inputs[0].sourceTXID!)
    expect(inputScriptValid(refund, 0)).toBe(true)
  })

  it('refuses amounts above the PoC caps before anything moves', async () => {
    const before = await usdcBalance(evm, parties.usdc, AGENT_EVM)
    await expect(runSwap(parties, { amount: 1_000_001n, satsPerUsdc: 2_000 })).rejects.toThrow(/PoC cap/)
    await expect(runSwap(parties, { amount: 1_000_000n, satsPerUsdc: 5_000 })).rejects.toThrow(new RegExp(`cap is 1..${MAX_SWAP_SATS}`))
    expect(await usdcBalance(evm, parties.usdc, AGENT_EVM)).toBe(before)
  })
})
