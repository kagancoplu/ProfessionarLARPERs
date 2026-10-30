/**
 * Base side of the Coop Rail: the AgentCoopHTLC contract through an EvmPort (D-P3 §4.1).
 * USDC amounts are base units (6 decimals); hashlock = sha256(secret), as on BSV.
 */
import { decodeEventLog, type Abi, type Address, type Hex } from 'viem'
import { loadArtifacts } from './compile'
import type { EvmLog, EvmPort } from './evm'

const artifacts = loadArtifacts()
export const HTLC_ABI = artifacts.contracts.AgentCoopHTLC.abi as Abi
export const USDC_ABI = artifacts.contracts.MockUSDC.abi as Abi
export const LOCK_STATE = ['none', 'locked', 'claimed', 'refunded'] as const

export interface BaseLock {
  id: Hex
  sender: Address
  receiver: Address
  token: Address
  amount: bigint
  hashlock: Hex
  timeout: bigint
  state: typeof LOCK_STATE[number]
}

export const deployHtlc = async (evm: EvmPort, from: Address): Promise<Address> =>
  await evm.deploy(from, HTLC_ABI, artifacts.contracts.AgentCoopHTLC.bytecode)

export const deployMockUsdc = async (evm: EvmPort, from: Address): Promise<Address> =>
  await evm.deploy(from, USDC_ABI, artifacts.contracts.MockUSDC.bytecode)

export const usdcBalance = async (evm: EvmPort, token: Address, who: Address): Promise<bigint> =>
  await evm.read<bigint>(token, USDC_ABI, 'balanceOf', [who])

const event = (logs: EvmLog[], htlc: Address, name: 'Locked' | 'Claimed' | 'Refunded'): { args: Record<string, unknown> } | undefined => {
  for (const l of logs) {
    if (l.address.toLowerCase() !== htlc.toLowerCase()) continue
    try {
      const d = decodeEventLog({ abi: HTLC_ABI, data: l.data, topics: l.topics as [Hex, ...Hex[]] })
      if (d.eventName === name) return { args: d.args as unknown as Record<string, unknown> }
    } catch { /* another event */ }
  }
  return undefined
}

/** Agent: approve + lock `amount` of `token` for `receiver` under `hashlock` until `timeout` (unix seconds). */
export async function lockUsdc (evm: EvmPort, a: { htlc: Address, token: Address, from: Address, receiver: Address, amount: bigint, hashlock: Hex, timeout: bigint }): Promise<{ id: Hex, txHash: Hex }> {
  await evm.write(a.from, a.token, USDC_ABI, 'approve', [a.htlc, a.amount])
  const { logs, txHash } = await evm.write(a.from, a.htlc, HTLC_ABI, 'lock', [a.receiver, a.token, a.amount, a.hashlock, a.timeout])
  const e = event(logs, a.htlc, 'Locked')
  if (e === undefined) throw new Error('lock emitted no Locked event')
  return { id: e.args.id as Hex, txHash }
}

export async function getLock (evm: EvmPort, htlc: Address, id: Hex): Promise<BaseLock> {
  const [sender, receiver, token, amount, hashlock, timeout, state] = await evm.read<[Address, Address, Address, bigint, Hex, bigint, number]>(htlc, HTLC_ABI, 'locks', [id])
  return { id, sender, receiver, token, amount, hashlock, timeout, state: LOCK_STATE[state] }
}

/** Anyone (the maker, in the swap): claim with the secret revealed on BSV. The tokens always go to the receiver. */
export async function claimUsdc (evm: EvmPort, a: { htlc: Address, from: Address, id: Hex, secret: Hex }): Promise<{ txHash: Hex }> {
  const { logs, txHash } = await evm.write(a.from, a.htlc, HTLC_ABI, 'claim', [a.id, a.secret])
  if (event(logs, a.htlc, 'Claimed') === undefined) throw new Error('claim emitted no Claimed event')
  return { txHash }
}

/** After the timeout: the tokens go back to the sender. */
export async function refundUsdc (evm: EvmPort, a: { htlc: Address, from: Address, id: Hex }): Promise<{ txHash: Hex }> {
  const { logs, txHash } = await evm.write(a.from, a.htlc, HTLC_ABI, 'refund', [a.id])
  if (event(logs, a.htlc, 'Refunded') === undefined) throw new Error('refund emitted no Refunded event')
  return { txHash }
}
