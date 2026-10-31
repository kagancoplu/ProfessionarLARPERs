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
import { RAIL_BASKET } from '../src/rail'
import { MAX_SWAP_SATS, runSwap, type SwapParties, type SwapStep } from '../src/swap'
import { watchOnce, type RailRecord } from '../src/watchdog'
import { createMockChain, type MockChain } from '../../../test/helpers/mockchain'
import { broadcastMock } from '../../../packages/overlay/test/helpers/settlement'

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

  it('F-4: the guard is down, the claim fails after the funding is out; the watchdog sends the refund once it is final', async () => {
    // the record swap-demo.ts writes from the same steps
    let record: RailRecord = {}
    const onStep = (s: SwapStep): void => {
      if (s.step === 'quote') record.swapId = s.swapId
      if (s.step === 'refund_ready') Object.assign(record, { refundEF: s.efHex, refundTxid: s.txid, refundLockTime: s.lockTime })
      if (s.step === 'funding_sent') record.fundingSent = true
    }
    const down: Cosigner = async () => { throw new Error('guard unreachable') }
    await expect(runSwap({ ...parties, cosign: down }, { amount: 300_000n, satsPerUsdc: 2_000, onStep })).rejects.toThrow(/guard unreachable/)
    expect(record.fundingSent).toBe(true)

    const height = await chain.services.getHeight()
    const sent: string[] = []
    const deps = (tip: number): Parameters<typeof watchOnce>[0] => ({
      records: () => [{ record, save: r => { record = r } }],
      tip: async () => tip,
      broadcast: async ef => {
        // the mock chain takes BEEF: give the EF's input its funding with ancestry from the maker's rail basket
        const tx = Transaction.fromHexEF(ef)
        const { BEEF } = await maker.listOutputs({ basket: RAIL_BASKET, include: 'entire transactions', limit: 1000 })
        tx.inputs[0].sourceTransaction = Transaction.fromBEEF(Array.from(BEEF!), tx.inputs[0].sourceTXID)
        await broadcastMock(chain.services, tx)
        sent.push(tx.id('hex'))
        return tx.id('hex')
      }
    })
    // not final yet: at the lock height itself Arcade refuses it (validation 4), so the watchdog waits one more block
    expect((await watchOnce(deps(record.refundLockTime!))).sent).toEqual([])
    expect(record.refunded).toBeUndefined()
    const r = await watchOnce(deps(record.refundLockTime! + 1))
    expect(record.refundError).toBeUndefined()
    expect(r.sent).toEqual([record.refundTxid])
    expect(record.refunded).toMatchObject({ txid: record.refundTxid, tip: record.refundLockTime! + 1 })
    const refund = await fetchTx(record.refundTxid!)
    expect(refund.lockTime).toBe(height + 6)
    expect(refund.outputs[0].satoshis).toBe(591 - 50) // 600 − 1.5 % spread, minus the refund fee
    // done: a second pass sends nothing
    expect((await watchOnce(deps(record.refundLockTime! + 5))).sent).toEqual([])
    expect(sent).toHaveLength(1)
  })

  it('F-4: the agent refuses to claim (and reveal the secret) when the refund is near final', async () => {
    let tip = await chain.services.getHeight()
    const late = { ...parties, height: async () => tip }
    const onStep = (s: SwapStep): void => { if (s.step === 'funding_sent') tip += 5 } // blocks pass before the agent claims
    await expect(runSwap(late, { amount: 100_000n, satsPerUsdc: 2_000, onStep })).rejects.toThrow(/too late to claim/)
  })

  it('refuses amounts above the PoC caps before anything moves', async () => {
    const before = await usdcBalance(evm, parties.usdc, AGENT_EVM)
    await expect(runSwap(parties, { amount: 1_000_001n, satsPerUsdc: 2_000 })).rejects.toThrow(/PoC cap/)
    await expect(runSwap(parties, { amount: 1_000_000n, satsPerUsdc: 5_000 })).rejects.toThrow(new RegExp(`cap is 1..${MAX_SWAP_SATS}`))
    expect(await usdcBalance(evm, parties.usdc, AGENT_EVM)).toBe(before)
  })
})
