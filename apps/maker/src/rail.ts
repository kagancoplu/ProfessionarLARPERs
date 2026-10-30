/**
 * Coop Rail swap steps, USDC (Base) → BSV into the agent's vault (plan/phases/D-P3.md §8).
 * Maker side and agent side as plain functions over wallets and an EvmPort, so the same
 * code runs on the mock chain + in-memory EVM (tests) and on mainnet + Base Sepolia.
 *
 *   agent  lockUsdc (base.ts)                       Base: USDC → HTLC(hash, maker, T_base)
 *   maker  verifyBaseLock → fundHtlc (v1, noSend)   BSV: HTLC(hash, agent, guard, maker) — txid known, not sent
 *   maker  buildRefund (v1, nLockTime H+k)  →  agent checkAndSignRefund  →  maker completeRefund (kept)
 *   maker  broadcastFunding (sendWith)
 *   agent  claimHtlc: OP_0 <sigA> <sigG> <secret> OP_1 → the agent's vault; guard kind:'rail'
 *   maker  extractSecret (from the claim) → claimUsdc (base.ts)
 */
import { LockingScript, P2PKH, PublicKey, Transaction, Utils, type WalletInterface } from '@agentcoop/core/sdk'
import { VAULT_BASKET } from '@agentcoop/core'
import {
  HTLC_CLAIM_UNLOCK_LENGTH,
  RAIL_PROTOCOL,
  RAIL_REFUND_SEQUENCE,
  htlcClaimUnlock,
  htlcRefundUnlock,
  parseHtlcLockingScript,
  railScriptFor,
  secretFromClaimUnlock,
  sha256Hex
} from '@agentcoop/core/scripts/htlc'
import { toChecksigSignature, vaultSighash, verifyVaultSignature } from '@agentcoop/core/scripts/vault'
import { broadcastResult, vaultTag, type Cosigner } from '@agentcoop/core/signers/VaultSigner'
import type { Address, Hex } from 'viem'
import { getLock } from './base'
import type { EvmPort } from './evm'

export const RAIL_BASKET = 'agentcoop rail'
/** BSV refund delay in blocks (≈ 1 h) and the Base timeout the maker requires (seconds left). */
export const DEFAULT_REFUND_BLOCKS = 6
export const MIN_BASE_TIMEOUT_LEFT_S = 3 * 3600
export const DEFAULT_SPREAD_BPS = 150

export interface Quote { usdc: bigint, sats: number, satsPerUsdc: number, spreadBps: number, expiresAt: string }

/** `usdc` base units (6 decimals) → sats at `satsPerUsdc` (per whole USDC) minus the spread. */
export function quote (usdc: bigint, satsPerUsdc: number, spreadBps = DEFAULT_SPREAD_BPS, ttlSeconds = 120): Quote {
  const gross = (usdc * BigInt(Math.round(satsPerUsdc))) / 1_000_000n
  const sats = Number(gross * BigInt(10_000 - spreadBps) / 10_000n)
  return { usdc, sats, satsPerUsdc, spreadBps, expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString() }
}

/** Maker: the Base lock pays at least `minAmount` of `token` to the maker under `hash`, with time left to finish. */
export async function verifyBaseLock (evm: EvmPort, a: { htlc: Address, id: Hex, maker: Address, token: Address, minAmount: bigint, hash: string, minTimeLeftS?: number }): Promise<{ amount: bigint, timeout: bigint }> {
  const l = await getLock(evm, a.htlc, a.id)
  if (l.state !== 'locked') throw new Error(`Base lock ${a.id} is ${l.state}`)
  if (l.receiver.toLowerCase() !== a.maker.toLowerCase()) throw new Error('Base lock does not pay the maker')
  if (l.token.toLowerCase() !== a.token.toLowerCase()) throw new Error('Base lock holds another token')
  if (l.amount < a.minAmount) throw new Error(`Base lock holds ${l.amount}, quote needs ${a.minAmount}`)
  if (l.hashlock.slice(2).toLowerCase() !== a.hash) throw new Error('Base lock has another hashlock')
  if (l.timeout < (await evm.now()) + BigInt(a.minTimeLeftS ?? MIN_BASE_TIMEOUT_LEFT_S)) throw new Error('Base lock expires too soon')
  return { amount: l.amount, timeout: l.timeout }
}

export interface SwapKeys { swapId: string, hash: string, agent: string, guard: string, maker: string }

export interface Funding { txid: string, vout: number, satoshis: number, lockingScriptHex: string, tx: number[] }

/** Maker: the BSV HTLC funding, version 1, signed but NOT sent (its txid is final, the refund can be pre-signed). */
export async function fundHtlc (maker: WalletInterface, k: SwapKeys, satoshis: number, originator?: string): Promise<Funding> {
  const lockingScriptHex = railScriptFor(k).toHex()
  const res = await maker.createAction({
    description: 'AgentCoop Coop Rail: HTLC funding',
    version: 1,
    outputs: [{ lockingScript: lockingScriptHex, satoshis, outputDescription: 'AgentCoop rail HTLC', basket: RAIL_BASKET, customInstructions: JSON.stringify({ swapId: k.swapId, role: 'maker' }), tags: [`swap:${k.swapId}`] }],
    options: { randomizeOutputs: false, noSend: true, acceptDelayedBroadcast: false }
  }, originator)
  if (res.txid === undefined || res.tx === undefined) throw new Error('funding was not signed')
  const tx = Transaction.fromAtomicBEEF(res.tx)
  if (tx.version !== 1) throw new Error(`funding is version ${tx.version}, expected 1`)
  const vout = tx.outputs.findIndex(o => o.lockingScript.toHex() === lockingScriptHex)
  return { txid: res.txid, vout, satoshis, lockingScriptHex, tx: Array.from(res.tx) }
}

/** Maker: send the funding signed earlier (after the agent has signed the refund). */
export async function broadcastFunding (maker: WalletInterface, funding: Funding, originator?: string): Promise<void> {
  const r = await maker.createAction({ description: 'AgentCoop Coop Rail: send HTLC funding', options: { sendWith: [funding.txid], acceptDelayedBroadcast: false } }, originator)
  const failed = r.sendWithResults?.find(x => x.status === 'failed')
  if (failed !== undefined) throw new Error(`funding ${funding.txid} was not accepted`)
}

/** Maker: the refund (ELSE branch) back to `refundScriptHex`, version 1, nLockTime = `lockHeight`, final only after it. */
export function buildRefund (funding: Funding, refundScriptHex: string, lockHeight: number, feeSats = 50): Transaction {
  if (!Number.isInteger(lockHeight) || lockHeight <= 0 || lockHeight >= 500_000_000) throw new Error('lockHeight must be a block height')
  const tx = new Transaction(1, [], [], lockHeight)
  tx.addInput({ sourceTransaction: Transaction.fromAtomicBEEF(funding.tx), sourceOutputIndex: funding.vout, sequence: RAIL_REFUND_SEQUENCE })
  tx.addOutput({ lockingScript: LockingScript.fromHex(refundScriptHex), satoshis: funding.satoshis - feeSats })
  return tx
}

async function signRail (w: WalletInterface, tx: Transaction, inputIndex: number, swapId: string, originator?: string): Promise<number[]> {
  const { signature } = await w.createSignature({ hashToDirectlySign: vaultSighash(tx, inputIndex), protocolID: RAIL_PROTOCOL, keyID: swapId, counterparty: 'anyone' }, originator)
  return toChecksigSignature(signature)
}

/**
 * Agent: sign the maker's refund only if it is the refund it should be: it spends the
 * HTLC this swap funds, from version 1 funding, and cannot be mined before `minLockHeight`
 * (the agent claims well before that). Returns the agent's signature (checksig format).
 */
export async function checkAndSignRefund (agent: WalletInterface, refund: Transaction, a: { funding: Funding, keys: SwapKeys, minLockHeight: number, originator?: string }): Promise<number[]> {
  const f = Transaction.fromAtomicBEEF(a.funding.tx)
  if (f.version !== 1 || refund.version !== 1) throw new Error('funding and refund must be version 1')
  if (f.id('hex') !== a.funding.txid || f.outputs[a.funding.vout]?.lockingScript.toHex() !== railScriptFor(a.keys).toHex()) throw new Error('funding does not lock this swap')
  if (refund.inputs.length !== 1) throw new Error('refund must spend only the HTLC')
  const inp = refund.inputs[0]
  if ((inp.sourceTXID ?? inp.sourceTransaction?.id('hex')) !== a.funding.txid || inp.sourceOutputIndex !== a.funding.vout) throw new Error('refund spends another output')
  if (inp.sequence !== RAIL_REFUND_SEQUENCE) throw new Error('refund sequence must enforce nLockTime')
  if (refund.lockTime < a.minLockHeight || refund.lockTime >= 500_000_000) throw new Error(`refund lockTime ${refund.lockTime} is earlier than ${a.minLockHeight}`)
  return await signRail(agent, refund, 0, a.keys.swapId, a.originator)
}

/** Maker: add its own signature; the refund is complete and kept until lockHeight (broadcast only if the agent never claims). */
export async function completeRefund (maker: WalletInterface, refund: Transaction, agentSig: number[], keys: SwapKeys, originator?: string): Promise<Transaction> {
  const parsed = parseHtlcLockingScript(refund.inputs[0].sourceTransaction!.outputs[refund.inputs[0].sourceOutputIndex].lockingScript)
  if (parsed === null || !verifyVaultSignature(parsed.agentPub, vaultSighash(refund, 0), agentSig)) throw new Error('agent refund signature invalid')
  const sigMaker = await signRail(maker, refund, 0, keys.swapId, originator)
  refund.inputs[0].unlockingScript = htlcRefundUnlock(sigMaker, agentSig)
  return refund
}

/**
 * Agent: claim the HTLC with the secret into its vault (agent + guard, guard kind:'rail').
 * The agent's wallet pays the miner fee from its own funds; the whole HTLC amount lands in the vault.
 */
export async function claimHtlc (agent: WalletInterface, a: { funding: Funding, keys: SwapKeys, secret: number[], vaultId: string, vaultScriptHex: string, cosign: Cosigner, originator?: string }): Promise<{ txid: string, tx: number[] }> {
  const { originator } = a
  if (sha256Hex(a.secret) !== a.keys.hash) throw new Error('secret does not match the hash')
  const outpoint = `${a.funding.txid}.${a.funding.vout}`
  const created = await agent.createAction({
    description: 'AgentCoop Coop Rail: claim into the vault',
    inputBEEF: a.funding.tx,
    inputs: [{ outpoint, unlockingScriptLength: HTLC_CLAIM_UNLOCK_LENGTH, inputDescription: 'AgentCoop rail HTLC' }],
    outputs: [{
      lockingScript: a.vaultScriptHex, satoshis: a.funding.satoshis, outputDescription: 'AgentCoop vault (from Coop Rail)', basket: VAULT_BASKET,
      customInstructions: JSON.stringify({ vaultId: a.vaultId, role: 'agent', protocolID: [1, 'agentcoop vault'], keyID: a.vaultId, counterparty: 'anyone' }), tags: [vaultTag(a.vaultId)]
    }],
    options: { randomizeOutputs: false, acceptDelayedBroadcast: false, signAndProcess: false }
  }, originator)
  const st = created.signableTransaction
  if (st === undefined) throw new Error('createAction returned no signable transaction')
  try {
    const tx = Transaction.fromAtomicBEEF(st.tx)
    const i = tx.inputs.findIndex(x => (x.sourceTXID ?? x.sourceTransaction?.id('hex')) === a.funding.txid && x.sourceOutputIndex === a.funding.vout)
    if (i < 0) throw new Error('HTLC input missing from the signable transaction')
    const sigAgent = await signRail(agent, tx, i, a.keys.swapId, originator)
    const { publicKey: me } = await agent.getPublicKey({ identityKey: true }, originator)
    const { signatureHex, guardPub } = await a.cosign({ txBEEF: Utils.toHex(tx.toAtomicBEEF(true)), inputIndex: i, agent: me, agentSignatureHex: Utils.toHex(sigAgent), context: { kind: 'rail', swapId: a.keys.swapId } })
    const sigGuard = Utils.toArray(signatureHex, 'hex')
    if (!verifyVaultSignature(guardPub, vaultSighash(tx, i), sigGuard)) throw new Error('guard returned a signature that does not verify')
    const unlock = htlcClaimUnlock(sigAgent, sigGuard, a.secret)
    return broadcastResult(await agent.signAction({ reference: st.reference, spends: { [i]: { unlockingScript: unlock.toHex() } } }, originator))
  } catch (e) {
    await agent.abortAction({ reference: st.reference }, originator).catch(() => {})
    throw e
  }
}

/** Maker: the secret from the agent's claim (the tx spending the HTLC), checked against the hash. */
export function extractSecret (claim: Transaction, funding: Funding, hash: string): Hex {
  const inp = claim.inputs.find(x => (x.sourceTXID ?? x.sourceTransaction?.id('hex')) === funding.txid && x.sourceOutputIndex === funding.vout)
  const s = inp?.unlockingScript === undefined ? null : secretFromClaimUnlock(inp.unlockingScript, hash)
  if (s === null) throw new Error('the transaction does not reveal the secret')
  return `0x${Utils.toHex(s)}`
}

/** The maker's own refund destination: P2PKH of its rail key for this swap (only the maker can spend it). */
export async function makerRefundScript (maker: WalletInterface, swapId: string, originator?: string): Promise<string> {
  const { publicKey } = await maker.getPublicKey({ protocolID: RAIL_PROTOCOL, keyID: `refund ${swapId}`, counterparty: 'anyone', forSelf: true }, originator)
  return new P2PKH().lock(PublicKey.fromString(publicKey).toAddress()).toHex()
}
