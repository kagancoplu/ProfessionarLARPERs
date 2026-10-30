/**
 * One Coop Rail swap, USDC (Base) → BSV into the agent's vault, as a single call
 * (D-P3 §8; task a.5). The same steps the e2e test runs, in order, over an EvmPort
 * and two wallets, so they run on the mock chain + in-memory EVM (test) and on
 * BSV mainnet + Base Sepolia (`swap-demo.ts`).
 *
 *   1 agent  Base: lock USDC for the maker under sha256(secret), timeout now + 6 h
 *   2 maker  check the lock; BSV: HTLC funding, version 1, signed but not sent
 *   3 maker  refund (nLockTime = H + 6) → agent checks and signs → maker completes and keeps it
 *   4 maker  send the funding
 *   5 agent  claim with the secret into its vault, the guard co-signs (kind:'rail')
 *   6 maker  read the secret from the claim; Base: claim the USDC
 *
 * `onStep` gets every step's result as it happens; a caller that stops halfway
 * (or crashes) still has the completed refund from step 3 to recover the maker's sats.
 */
import { createHash, randomBytes } from 'node:crypto'
import { Transaction, type WalletInterface } from '@agentcoop/core/sdk'
import { newSwapId } from '@agentcoop/core/scripts/htlc'
import type { Cosigner } from '@agentcoop/core/signers/VaultSigner'
import type { Address, Hex } from 'viem'
import { claimUsdc, lockUsdc } from './base'
import type { EvmPort } from './evm'
import {
  broadcastFunding, buildRefund, checkAndSignRefund, claimHtlc, completeRefund, DEFAULT_REFUND_BLOCKS, extractSecret, fundHtlc,
  makerRefundScript, quote, verifyBaseLock, type Quote, type SwapKeys
} from './rail'

/** PoC caps (docs/RAIL-POC.md): at most 1 USDC and 1,000 sat per swap. */
export const MAX_SWAP_USDC = 1_000_000n
export const MAX_SWAP_SATS = 1_000

export interface SwapParties {
  evm: EvmPort
  htlc: Address
  usdc: Address
  agentEvm: Address
  makerEvm: Address
  agent: WalletInterface
  maker: WalletInterface
  /** identity keys */
  agentIdentity: string
  makerIdentity: string
  guardIdentity: string
  cosign: Cosigner
  vault: { vaultId: string, lockingScriptHex: string }
  /** current BSV block height (Arcade on mainnet) */
  height: () => Promise<number>
  originator?: string
}

export interface SwapOptions {
  /** USDC base units (6 decimals) */
  amount: bigint
  satsPerUsdc: number
  refundBlocks?: number
  baseTimeoutS?: number
  onStep?: (step: SwapStep) => void | Promise<void>
}

export type SwapStep =
  | { step: 'quote', swapId: string, hash: string, quote: Quote }
  | { step: 'base_locked', id: Hex, txHash: Hex, timeout: string }
  | { step: 'funding_signed', txid: string, vout: number, satoshis: number }
  | { step: 'refund_ready', lockTime: number, rawHex: string, txid: string }
  | { step: 'funding_sent', txid: string }
  | { step: 'claimed', txid: string, satoshis: number }
  | { step: 'base_claimed', txHash: Hex }

export interface SwapResult { swapId: string, hash: string, sats: number, baseLockId: Hex, baseLockTx: Hex, fundingTxid: string, refundTxid: string, refundLockTime: number, claimTxid: string, baseClaimTx: Hex }

export async function runSwap (p: SwapParties, o: SwapOptions): Promise<SwapResult> {
  const step = async (s: SwapStep): Promise<void> => { await o.onStep?.(s) }
  const q = quote(o.amount, o.satsPerUsdc)
  if (o.amount <= 0n || o.amount > MAX_SWAP_USDC) throw new Error(`amount must be 1..${MAX_SWAP_USDC} USDC base units (PoC cap)`)
  if (q.sats < 1 || q.sats > MAX_SWAP_SATS) throw new Error(`the quote is ${q.sats} sat; the PoC cap is 1..${MAX_SWAP_SATS}`)

  // the agent's secret; only its hash leaves the agent until the claim
  const secret = Array.from(randomBytes(32))
  const hash = createHash('sha256').update(Buffer.from(secret)).digest('hex')
  const keys: SwapKeys = { swapId: newSwapId(), hash, agent: p.agentIdentity, guard: p.guardIdentity, maker: p.makerIdentity }
  await step({ step: 'quote', swapId: keys.swapId, hash, quote: q })

  // 1 Base: the agent locks the USDC for the maker
  const timeout = (await p.evm.now()) + BigInt(o.baseTimeoutS ?? 6 * 3600)
  const lock = await lockUsdc(p.evm, { htlc: p.htlc, token: p.usdc, from: p.agentEvm, receiver: p.makerEvm, amount: q.usdc, hashlock: `0x${hash}`, timeout })
  await step({ step: 'base_locked', id: lock.id, txHash: lock.txHash, timeout: new Date(Number(timeout) * 1000).toISOString() })

  // 2 BSV: the maker checks the lock and signs the funding (version 1, not sent)
  await verifyBaseLock(p.evm, { htlc: p.htlc, id: lock.id, maker: p.makerEvm, token: p.usdc, minAmount: q.usdc, hash })
  const funding = await fundHtlc(p.maker, keys, q.sats, p.originator)
  await step({ step: 'funding_signed', txid: funding.txid, vout: funding.vout, satoshis: funding.satoshis })

  // 3 the refund, signed by both before the funding exists on chain
  const lockTime = (await p.height()) + (o.refundBlocks ?? DEFAULT_REFUND_BLOCKS)
  const refund = buildRefund(funding, await makerRefundScript(p.maker, keys.swapId, p.originator), lockTime)
  const agentSig = await checkAndSignRefund(p.agent, refund, { funding, keys, minLockHeight: lockTime, originator: p.originator })
  const complete = await completeRefund(p.maker, refund, agentSig, keys, p.originator)
  await step({ step: 'refund_ready', lockTime, rawHex: complete.toHex(), txid: complete.id('hex') })

  // 4 the maker sends the funding
  await broadcastFunding(p.maker, funding, p.originator)
  await step({ step: 'funding_sent', txid: funding.txid })

  // 5 the agent claims into its vault with the guard (kind:'rail'); the secret becomes public here
  const claim = await claimHtlc(p.agent, { funding, keys, secret, vaultId: p.vault.vaultId, vaultScriptHex: p.vault.lockingScriptHex, cosign: p.cosign, originator: p.originator })
  await step({ step: 'claimed', txid: claim.txid, satoshis: funding.satoshis })

  // 6 the maker reads the secret from the claim and takes the USDC
  const revealed = extractSecret(Transaction.fromAtomicBEEF(claim.tx), funding, hash)
  const baseClaim = await claimUsdc(p.evm, { htlc: p.htlc, from: p.makerEvm, id: lock.id, secret: revealed })
  await step({ step: 'base_claimed', txHash: baseClaim.txHash })

  return {
    swapId: keys.swapId,
    hash,
    sats: q.sats,
    baseLockId: lock.id,
    baseLockTx: lock.txHash,
    fundingTxid: funding.txid,
    refundTxid: complete.id('hex'),
    refundLockTime: lockTime,
    claimTxid: claim.txid,
    baseClaimTx: baseClaim.txHash
  }
}
