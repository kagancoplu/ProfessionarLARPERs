/**
 * The Base HTLC with tokens that are not plain USDC (docs/AUDIT-READINESS.md F-1, F-2), on the same
 * in-process EVM as htlc.evm.test.ts. The odd tokens are test-only (contracts/base-htlc/test/OddTokens.sol).
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { getAddress, type Abi, type Address, type Hex } from 'viem'
import { CONTRACTS_DIR, EVM_VERSION } from '../src/compile'
import { MemoryEvm } from '../src/evm'
import { claimUsdc, deployHtlc, getLock, HTLC_ABI, lockUsdc, refundUsdc } from '../src/base'

const AGENT: Address = getAddress('0x00000000000000000000000000000000000a6e17')
const AGENT2: Address = getAddress('0x00000000000000000000000000000000000a6e18')
const MAKER: Address = getAddress('0x000000000000000000000000000000000000ba5e')
const T0 = 1_800_000_000n
const secret: Hex = `0x${'42'.repeat(32)}`
const hashlock: Hex = `0x${createHash('sha256').update(Buffer.from(secret.slice(2), 'hex')).digest('hex')}`

type Name = 'FeeToken' | 'NoReturnToken' | 'FalseToken'
let tokens: Record<Name, { abi: Abi, bytecode: Hex }>

beforeAll(() => {
  const solc = createRequire(import.meta.url)('solc') as { compile: (input: string) => string }
  const file = 'OddTokens.sol'
  const out = JSON.parse(solc.compile(JSON.stringify({
    language: 'Solidity',
    sources: { [file]: { content: readFileSync(join(CONTRACTS_DIR, 'test', file), 'utf8') } },
    settings: { evmVersion: EVM_VERSION, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } }
  }))) as { errors?: Array<{ severity: string, formattedMessage: string }>, contracts: Record<string, Record<string, { abi: Abi, evm: { bytecode: { object: string } } }>> }
  const errors = (out.errors ?? []).filter(e => e.severity === 'error')
  if (errors.length > 0) throw new Error(errors.map(e => e.formattedMessage).join('\n'))
  const pick = (n: Name): { abi: Abi, bytecode: Hex } => ({ abi: out.contracts[file][n].abi, bytecode: `0x${out.contracts[file][n].evm.bytecode.object}` })
  tokens = { FeeToken: pick('FeeToken'), NoReturnToken: pick('NoReturnToken'), FalseToken: pick('FalseToken') }
}, 60_000)

async function setup (name: Name): Promise<{ evm: MemoryEvm, token: Address, htlc: Address, balance: (who: Address) => Promise<bigint> }> {
  const evm = await MemoryEvm.create(T0)
  const { abi, bytecode } = tokens[name]
  const token = await evm.deploy(MAKER, abi, bytecode)
  const htlc = await deployHtlc(evm, MAKER)
  for (const who of [AGENT, AGENT2]) await evm.write(who, token, abi, 'mint', [who, 1_000_000n])
  return { evm, token, htlc, balance: async who => await evm.read<bigint>(token, abi, 'balanceOf', [who]) }
}

describe('AgentCoopHTLC token handling', () => {
  it('F-1: a fee-on-transfer token is refused at lock, so it can never pay out the tokens of another lock', async () => {
    const { evm, token, htlc, balance } = await setup('FeeToken')
    await expect(lockUsdc(evm, { htlc, token, from: AGENT, receiver: MAKER, amount: 500_000n, hashlock, timeout: T0 + 600n })).rejects.toThrow(/received less than amount/)
    expect(await balance(htlc)).toBe(0n)
    expect(await balance(AGENT)).toBe(1_000_000n)
  })

  it('F-2: a token that returns nothing from transfer locks, claims and refunds', async () => {
    const { evm, token, htlc, balance } = await setup('NoReturnToken')
    const a = await lockUsdc(evm, { htlc, token, from: AGENT, receiver: MAKER, amount: 300_000n, hashlock, timeout: T0 + 600n })
    const b = await lockUsdc(evm, { htlc, token, from: AGENT2, receiver: MAKER, amount: 200_000n, hashlock, timeout: T0 + 600n })
    expect(await balance(htlc)).toBe(500_000n)
    await claimUsdc(evm, { htlc, from: MAKER, id: a.id, secret })
    evm.advance(600)
    await refundUsdc(evm, { htlc, from: AGENT2, id: b.id })
    expect(await balance(MAKER)).toBe(300_000n)
    expect(await balance(AGENT2)).toBe(1_000_000n)
    expect(await balance(htlc)).toBe(0n)
  })

  it('F-2: a token that returns false instead of reverting cannot create a lock it was never paid for', async () => {
    const { evm, token, htlc, balance } = await setup('FalseToken')
    // no approve: transferFrom returns false
    await expect(evm.write(AGENT, htlc, HTLC_ABI, 'lock', [MAKER, token, 100_000n, hashlock, T0 + 600n])).rejects.toThrow(/transferFrom failed/)
    expect(await balance(htlc)).toBe(0n)
  })

  it('a token address with no contract behind it is refused (its balanceOf reverts)', async () => {
    const { evm, htlc } = await setup('NoReturnToken')
    await expect(evm.write(AGENT, htlc, HTLC_ABI, 'lock', [MAKER, getAddress('0x000000000000000000000000000000000000dEaD'), 1n, hashlock, T0 + 600n])).rejects.toThrow(/EVM revert/)
    await expect(getLock(evm, htlc, `0x${'00'.repeat(32)}`)).resolves.toMatchObject({ state: 'none' })
  })
})
