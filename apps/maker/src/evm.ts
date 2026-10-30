/**
 * EVM access for the Coop Rail (plan/phases/D-P3.md §4.7). Two implementations of one port:
 *
 *   MemoryEvm  @ethereumjs/evm in-process, unsigned calls and a settable clock: tests and the
 *              offline demo (no faucet, no RPC)
 *   ViemEvm    viem against Base Sepolia (BASE_RPC_URL); keys come from .env, never logged
 *
 * The rail code talks only to EvmPort, so the same swap steps run against either.
 */
import { createEVM, type EVM } from '@ethereumjs/evm'
import { createAddressFromString, createZeroAddress } from '@ethereumjs/util'
import {
  createPublicClient, createWalletClient, decodeFunctionResult, encodeDeployData, encodeFunctionData, getAddress, http, keccak256, toBytes,
  bytesToHex, hexToBytes, type Abi, type Address, type Hex, type Log
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'

export interface EvmLog { address: Address, topics: Hex[], data: Hex }

export interface EvmPort {
  /** Deploy `bytecode` (with encoded constructor args) from `from`; returns the contract address. */
  deploy: (from: Address, abi: Abi, bytecode: Hex, args?: unknown[]) => Promise<Address>
  /** A state-changing call; throws with the revert reason. Returns the emitted logs and the tx hash (live) or a pseudo hash (memory). */
  write: (from: Address, to: Address, abi: Abi, functionName: string, args: unknown[]) => Promise<{ logs: EvmLog[], txHash: Hex }>
  read: <T = unknown>(to: Address, abi: Abi, functionName: string, args: unknown[]) => Promise<T>
  /** Current block timestamp (seconds). */
  now: () => Promise<bigint>
}

/** In-process EVM. Accounts are plain addresses (calls are not signed); the clock only moves when told to. */
export class MemoryEvm implements EvmPort {
  private constructor (private readonly evm: EVM, private clock: bigint) {}
  private calls = 0

  static async create (startTime = BigInt(Math.floor(Date.now() / 1000))): Promise<MemoryEvm> {
    return new MemoryEvm(await createEVM(), startTime)
  }

  /** Move the block clock forward (refund paths). */
  advance (seconds: number): void { this.clock += BigInt(seconds) }

  async now (): Promise<bigint> { return this.clock }

  /** The block every call runs in: only the timestamp matters to the HTLC. */
  private block (): NonNullable<Parameters<EVM['runCall']>[0]['block']> {
    return {
      header: {
        number: this.clock, coinbase: createZeroAddress(), timestamp: this.clock, difficulty: 0n,
        prevRandao: new Uint8Array(32), gasLimit: 30_000_000n, baseFeePerGas: 0n, getBlobGasPrice: () => 0n
      }
    }
  }

  private async run (from: Address, to: Address | undefined, data: Hex): Promise<{ returnValue: Uint8Array, logs: EvmLog[], created?: Address }> {
    const res = await this.evm.runCall({
      caller: createAddressFromString(from),
      ...(to !== undefined ? { to: createAddressFromString(to) } : {}),
      data: hexToBytes(data),
      gasLimit: 10_000_000n,
      block: this.block(),
      skipBalance: true
    })
    const r = res.execResult
    if (r.exceptionError !== undefined) throw new Error(`EVM revert: ${revertReason(r.returnValue) ?? r.exceptionError.error}`)
    const logs = (r.logs ?? []).map(([address, topics, d]) => ({ address: getAddress(bytesToHex(address)), topics: topics.map(t => bytesToHex(t)), data: bytesToHex(d) }))
    return { returnValue: r.returnValue, logs, ...(res.createdAddress !== undefined ? { created: getAddress(res.createdAddress.toString()) } : {}) }
  }

  async deploy (from: Address, abi: Abi, bytecode: Hex, args: unknown[] = []): Promise<Address> {
    const r = await this.run(from, undefined, encodeDeployData({ abi, bytecode, args }))
    if (r.created === undefined) throw new Error('deploy created no contract')
    return r.created
  }

  async write (from: Address, to: Address, abi: Abi, functionName: string, args: unknown[]): Promise<{ logs: EvmLog[], txHash: Hex }> {
    const data = encodeFunctionData({ abi, functionName, args })
    const { logs } = await this.run(from, to, data)
    return { logs, txHash: keccak256(toBytes(`${data}:${++this.calls}`)) }
  }

  async read<T = unknown> (to: Address, abi: Abi, functionName: string, args: unknown[]): Promise<T> {
    const r = await this.run('0x0000000000000000000000000000000000000001', to, encodeFunctionData({ abi, functionName, args }))
    return decodeFunctionResult({ abi, functionName, data: bytesToHex(r.returnValue) }) as T
  }
}

/** Error(string) revert data → the message. */
function revertReason (data: Uint8Array): string | undefined {
  const hex = bytesToHex(data)
  if (!hex.startsWith('0x08c379a0')) return undefined
  try { return decodeFunctionResult({ abi: [{ type: 'function', name: 'Error', inputs: [], outputs: [{ type: 'string' }] }], functionName: 'Error', data: `0x${hex.slice(10)}` }) as string } catch { return undefined }
}

/** Base Sepolia through viem. One wallet client per private key (from .env); nothing is logged. */
export class ViemEvm implements EvmPort {
  private readonly client
  private readonly wallets = new Map<Address, ReturnType<typeof createWalletClient>>()

  constructor (rpcUrl: string, privateKeys: Hex[]) {
    this.client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) })
    for (const k of privateKeys) {
      const account = privateKeyToAccount(k)
      this.wallets.set(account.address, createWalletClient({ account, chain: baseSepolia, transport: http(rpcUrl) }))
    }
  }

  get addresses (): Address[] { return [...this.wallets.keys()] }

  private wallet (from: Address): ReturnType<typeof createWalletClient> {
    const w = this.wallets.get(getAddress(from))
    if (w === undefined) throw new Error(`no key for ${from}`)
    return w
  }

  async now (): Promise<bigint> { return (await this.client.getBlock()).timestamp }

  async deploy (from: Address, abi: Abi, bytecode: Hex, args: unknown[] = []): Promise<Address> {
    const w = this.wallet(from)
    const hash = await w.deployContract({ abi, bytecode, args, account: w.account!, chain: baseSepolia })
    const receipt = await this.client.waitForTransactionReceipt({ hash })
    if (receipt.contractAddress == null) throw new Error(`deploy ${hash} created no contract`)
    return receipt.contractAddress
  }

  async write (from: Address, to: Address, abi: Abi, functionName: string, args: unknown[]): Promise<{ logs: EvmLog[], txHash: Hex }> {
    const w = this.wallet(from)
    const { request } = await this.client.simulateContract({ address: to, abi, functionName, args, account: w.account! })
    const hash = await w.writeContract(request)
    const receipt = await this.client.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') throw new Error(`${functionName} ${hash} reverted`)
    return { logs: receipt.logs.map((l: Log) => ({ address: l.address, topics: l.topics as Hex[], data: l.data })), txHash: hash }
  }

  async read<T = unknown> (to: Address, abi: Abi, functionName: string, args: unknown[]): Promise<T> {
    return await this.client.readContract({ address: to, abi, functionName, args }) as T
  }
}
