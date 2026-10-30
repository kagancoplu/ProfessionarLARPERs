/**
 * D-P3 §9.1: the Base HTLC on an in-process EVM (@ethereumjs/evm): no faucet, no RPC.
 * The committed artifact must equal a fresh solc compile of contracts/base-htlc/*.sol.
 */
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { getAddress, type Address, type Hex } from 'viem'
import { compile, loadArtifacts } from '../src/compile'
import { MemoryEvm } from '../src/evm'
import { claimUsdc, deployHtlc, deployMockUsdc, getLock, lockUsdc, refundUsdc, USDC_ABI, usdcBalance } from '../src/base'

const AGENT: Address = getAddress('0x00000000000000000000000000000000000a6e17')
const MAKER: Address = getAddress('0x000000000000000000000000000000000000ba5e')
const secret: Hex = `0x${'42'.repeat(32)}`
const hashlock: Hex = `0x${createHash('sha256').update(Buffer.from(secret.slice(2), 'hex')).digest('hex')}`

describe('AgentCoopHTLC (Base side of the Coop Rail)', () => {
  it('the committed artifact is what solc 0.8.37 compiles from the sources', () => {
    expect(compile()).toEqual(loadArtifacts())
  }, 60_000)

  it('lock → claim with the secret pays the receiver; wrong secret, double claim and early refund revert', async () => {
    const evm = await MemoryEvm.create(1_800_000_000n)
    const usdc = await deployMockUsdc(evm, MAKER)
    const htlc = await deployHtlc(evm, MAKER)
    await evm.write(AGENT, usdc, USDC_ABI, 'mint', [AGENT, 1_000_000n]) // 1 USDC
    const { id } = await lockUsdc(evm, { htlc, token: usdc, from: AGENT, receiver: MAKER, amount: 750_000n, hashlock, timeout: 1_800_021_600n })
    expect(await getLock(evm, htlc, id)).toMatchObject({ sender: AGENT, receiver: MAKER, token: usdc, amount: 750_000n, hashlock, timeout: 1_800_021_600n, state: 'locked' })
    expect(await usdcBalance(evm, usdc, htlc)).toBe(750_000n)

    await expect(claimUsdc(evm, { htlc, from: MAKER, id, secret: `0x${'43'.repeat(32)}` })).rejects.toThrow(/wrong secret/)
    await expect(refundUsdc(evm, { htlc, from: AGENT, id })).rejects.toThrow(/not expired/)
    await claimUsdc(evm, { htlc, from: AGENT, id, secret }) // anyone may claim; the tokens go to the receiver
    expect(await usdcBalance(evm, usdc, MAKER)).toBe(750_000n)
    expect((await getLock(evm, htlc, id)).state).toBe('claimed')
    await expect(claimUsdc(evm, { htlc, from: MAKER, id, secret })).rejects.toThrow(/not locked/)
  })

  it('after the timeout: claim reverts, refund returns the tokens to the sender', async () => {
    const evm = await MemoryEvm.create(1_800_000_000n)
    const usdc = await deployMockUsdc(evm, MAKER)
    const htlc = await deployHtlc(evm, MAKER)
    await evm.write(AGENT, usdc, USDC_ABI, 'mint', [AGENT, 500_000n])
    await expect(lockUsdc(evm, { htlc, token: usdc, from: AGENT, receiver: MAKER, amount: 500_000n, hashlock, timeout: 1_799_999_999n })).rejects.toThrow(/timeout in the past/)
    const { id } = await lockUsdc(evm, { htlc, token: usdc, from: AGENT, receiver: MAKER, amount: 500_000n, hashlock, timeout: 1_800_000_600n })
    evm.advance(600)
    await expect(claimUsdc(evm, { htlc, from: MAKER, id, secret })).rejects.toThrow(/expired/)
    await refundUsdc(evm, { htlc, from: MAKER, id }) // anyone may trigger it; the tokens go to the sender
    expect(await usdcBalance(evm, usdc, AGENT)).toBe(500_000n)
    expect((await getLock(evm, htlc, id)).state).toBe('refunded')
    await expect(refundUsdc(evm, { htlc, from: AGENT, id })).rejects.toThrow(/not locked/)
  })
})
