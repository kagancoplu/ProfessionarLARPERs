/**
 * Boundary and isolation properties of the Base HTLC (docs/AUDIT-READINESS.md §4), on the same
 * in-process EVM as htlc.evm.test.ts. Tests only: the contract and its artifact are unchanged.
 */
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { getAddress, zeroAddress, type Address, type Hex } from 'viem'
import { MemoryEvm } from '../src/evm'
import { claimUsdc, deployHtlc, deployMockUsdc, getLock, HTLC_ABI, lockUsdc, refundUsdc, USDC_ABI, usdcBalance } from '../src/base'

const AGENT: Address = getAddress('0x00000000000000000000000000000000000a6e17')
const AGENT2: Address = getAddress('0x00000000000000000000000000000000000a6e18')
const MAKER: Address = getAddress('0x000000000000000000000000000000000000ba5e')
const STRANGER: Address = getAddress('0x0000000000000000000000000000000000005757')
const T0 = 1_800_000_000n
const secret: Hex = `0x${'42'.repeat(32)}`
const hashlock: Hex = `0x${createHash('sha256').update(Buffer.from(secret.slice(2), 'hex')).digest('hex')}`

async function setup (): Promise<{ evm: MemoryEvm, usdc: Address, htlc: Address }> {
  const evm = await MemoryEvm.create(T0)
  const usdc = await deployMockUsdc(evm, MAKER)
  const htlc = await deployHtlc(evm, MAKER)
  for (const who of [AGENT, AGENT2]) await evm.write(who, usdc, USDC_ABI, 'mint', [who, 1_000_000n])
  return { evm, usdc, htlc }
}

describe('AgentCoopHTLC boundaries', () => {
  it('a timeout equal to the current time is refused at lock', async () => {
    const { evm, usdc, htlc } = await setup()
    await expect(lockUsdc(evm, { htlc, token: usdc, from: AGENT, receiver: MAKER, amount: 1n, hashlock, timeout: T0 })).rejects.toThrow(/timeout in the past/)
  })

  it('claim at exactly the timeout reverts; refund one second before it reverts, at it succeeds', async () => {
    const { evm, usdc, htlc } = await setup()
    const { id } = await lockUsdc(evm, { htlc, token: usdc, from: AGENT, receiver: MAKER, amount: 400_000n, hashlock, timeout: T0 + 600n })
    evm.advance(599)
    await expect(refundUsdc(evm, { htlc, from: AGENT, id })).rejects.toThrow(/not expired/)
    evm.advance(1) // block.timestamp == timeout
    await expect(claimUsdc(evm, { htlc, from: MAKER, id, secret })).rejects.toThrow(/expired/)
    await refundUsdc(evm, { htlc, from: AGENT, id })
    expect(await usdcBalance(evm, usdc, AGENT)).toBe(1_000_000n)
  })

  it('a second lock with identical parameters reverts (lock exists); a different timeout makes a new id', async () => {
    const { evm, usdc, htlc } = await setup()
    const a = { htlc, token: usdc, from: AGENT, receiver: MAKER, amount: 100_000n, hashlock, timeout: T0 + 3600n }
    const first = await lockUsdc(evm, a)
    await expect(lockUsdc(evm, a)).rejects.toThrow(/lock exists/)
    const second = await lockUsdc(evm, { ...a, timeout: a.timeout + 1n })
    expect(second.id).not.toBe(first.id)
    expect(await usdcBalance(evm, usdc, htlc)).toBe(200_000n)
  })

  it('zero amount and zero addresses are refused', async () => {
    const { evm, usdc, htlc } = await setup()
    await expect(lockUsdc(evm, { htlc, token: usdc, from: AGENT, receiver: MAKER, amount: 0n, hashlock, timeout: T0 + 600n })).rejects.toThrow(/zero amount/)
    await expect(lockUsdc(evm, { htlc, token: usdc, from: AGENT, receiver: zeroAddress, amount: 1n, hashlock, timeout: T0 + 600n })).rejects.toThrow(/zero address/)
    await expect(evm.write(AGENT, htlc, HTLC_ABI, 'lock', [MAKER, zeroAddress, 1n, hashlock, T0 + 600n])).rejects.toThrow(/zero address/)
    expect(await usdcBalance(evm, usdc, htlc)).toBe(0n)
  })

  it('two locks of the same token are isolated: claiming one leaves the other\'s tokens in the contract', async () => {
    const { evm, usdc, htlc } = await setup()
    const one = await lockUsdc(evm, { htlc, token: usdc, from: AGENT, receiver: MAKER, amount: 300_000n, hashlock, timeout: T0 + 600n })
    const two = await lockUsdc(evm, { htlc, token: usdc, from: AGENT2, receiver: MAKER, amount: 700_000n, hashlock, timeout: T0 + 1200n })
    await claimUsdc(evm, { htlc, from: MAKER, id: one.id, secret })
    expect(await usdcBalance(evm, usdc, htlc)).toBe(700_000n)
    await expect(claimUsdc(evm, { htlc, from: MAKER, id: one.id, secret })).rejects.toThrow(/not locked/)
    evm.advance(1200)
    await refundUsdc(evm, { htlc, from: AGENT2, id: two.id })
    expect(await usdcBalance(evm, usdc, AGENT2)).toBe(1_000_000n)
    expect(await usdcBalance(evm, usdc, htlc)).toBe(0n)
  })

  it('whoever calls, a claim pays the receiver and a refund pays the sender', async () => {
    const { evm, usdc, htlc } = await setup()
    const a = await lockUsdc(evm, { htlc, token: usdc, from: AGENT, receiver: MAKER, amount: 250_000n, hashlock, timeout: T0 + 600n })
    const b = await lockUsdc(evm, { htlc, token: usdc, from: AGENT2, receiver: MAKER, amount: 150_000n, hashlock, timeout: T0 + 600n })
    await claimUsdc(evm, { htlc, from: STRANGER, id: a.id, secret })
    evm.advance(600)
    await refundUsdc(evm, { htlc, from: STRANGER, id: b.id })
    expect(await usdcBalance(evm, usdc, STRANGER)).toBe(0n)
    expect(await usdcBalance(evm, usdc, MAKER)).toBe(250_000n)
    expect(await usdcBalance(evm, usdc, AGENT2)).toBe(1_000_000n)
    expect((await getLock(evm, htlc, a.id)).state).toBe('claimed')
    expect((await getLock(evm, htlc, b.id)).state).toBe('refunded')
  })
})
