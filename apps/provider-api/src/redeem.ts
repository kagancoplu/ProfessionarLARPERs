/**
 * POST /v1/credits/redeem and /v1/credits/return (MASTER §3.6, FINAL-IDEA §4.7).
 *
 * Redeem: the agent sends credits to the provider-api's token address with an
 * ordinary BSV-21 transfer, then posts `{ beef, outputIndex }` over an
 * authenticated (BRC-103) request. The provider accepts the output only if:
 *  1. it is a BSV-21 transfer of a product's credit token;
 *  2. it is locked to one of the provider-api's own receive addresses;
 *  3. it moves ≤ 20 credits, and the caller's prepaid balance stays ≤ 20;
 *  4. the caller spent its own tokens in that transaction (otherwise anyone who
 *     saw the transfer on the overlay could claim it first);
 *  5. its lineage is genuine: Track A's `verifyLineage` walks it back to the
 *     token's deploy itself (ancestors from the posted BEEF, the rest from
 *     Arcade; txids are recomputed, so a forged BEEF fails). The overlay is
 *     only used for discovery;
 *  6. it was not redeemed before.
 * Then the wallet internalizes it into the `bsv21` basket (SPV-checked) and
 * the caller's prepaid balance grows by credits × unitsPerCredit metered units.
 *
 * Return: unused whole credits go back to the caller as tokens (TokenKit.send);
 * a remainder smaller than one credit stays prepaid.
 */
import { Beef, Transaction, Utils, type WalletInterface } from '@agentcoop/core/sdk'
import {
  arcadeTxFetcher, decodeBsv21, GAP_LIMIT, instructionsFor, MAX_PENDING_REDEEM_CREDITS, MAX_REDEEM_CREDITS, receivePkh, TOKEN_BASKET,
  verifyLineage as coreVerifyLineage, type OverlayClient, type TokenKit, type TxFetcher
} from '@agentcoop/core'
import type { CreditLedger } from './credits'
import { defaultProduct, runnerIdOf, unitsPerCredit, type Product } from './products'

export type VerifyLineage = typeof coreVerifyLineage

export class CreditError extends Error {
  constructor (readonly status: number, readonly code: string, description: string) {
    super(description)
    this.name = 'CreditError'
  }
}

export interface CreditDeps {
  wallet: WalletInterface
  kit: TokenKit
  overlay: OverlayClient
  ledger: CreditLedger
  products: Product[]
  /** Override Track A's verifyLineage (tests). */
  verifyLineage?: VerifyLineage
  /** Where ancestors missing from the posted BEEF come from. Default: Arcade, then WhatsOnChain. */
  fetchTx?: TxFetcher
  arcadeUrl?: string
}

export interface RedeemResult {
  outpoint: string
  product: string
  tokenId: string
  credits: number
  /** Prepaid balance after the redeem, in the product's metered units. */
  prepaidUnits: number
  /** GPU products: the same as prepaidUnits. */
  prepaidMinutes?: number
  /** Transactions verifyLineage walked back to the deploy. */
  lineageDepth: number
}

/** One token operation of the provider wallet at a time (coin selection must not race). */
export class Serial {
  private tail: Promise<unknown> = Promise.resolve()
  async run<T> (fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn)
    this.tail = next.catch(() => {})
    return await next
  }
}

const parseBeef = (beef: unknown): number[] => {
  if (typeof beef === 'string' && /^[0-9a-fA-F]+$/.test(beef)) return Utils.toArray(beef, 'hex')
  if (Array.isArray(beef) && beef.every(b => Number.isInteger(b) && b >= 0 && b <= 255)) return beef as number[]
  throw new CreditError(400, 'ERR_BAD_REQUEST', 'beef must be a byte array or hex string')
}

/** Ancestors from the BEEF the agent posted first, then the network. */
const beefFirst = (beef: Beef, fallback: TxFetcher): TxFetcher => async (txid: string) => beef.findTxid(txid)?.tx ?? await fallback(txid)

async function checkLineage (deps: CreditDeps, beef: Beef, txid: string, vout: number, expect: { tokenId: string, amount: bigint, ownerPkh: string }): Promise<number> {
  const verify = deps.verifyLineage ?? coreVerifyLineage
  let r: Awaited<ReturnType<VerifyLineage>>
  try {
    r = await verify(`${txid}_${vout}`, { fetchTx: beefFirst(beef, deps.fetchTx ?? arcadeTxFetcher(deps.arcadeUrl)) })
  } catch (e) {
    throw new CreditError(400, 'ERR_BAD_LINEAGE', `could not verify the credits' lineage: ${(e as Error).message}`)
  }
  if (!r.ok || r.tokenId !== expect.tokenId || r.amt !== expect.amount || r.ownerPkh !== expect.ownerPkh) {
    throw new CreditError(400, 'ERR_BAD_LINEAGE', `the credit output does not descend from the token deploy${r.reason !== undefined ? ` (${r.reason})` : ''}`)
  }
  return r.depth
}

export async function redeemCredits (deps: CreditDeps, caller: string, body: unknown): Promise<RedeemResult> {
  const { beef: rawBeef, outputIndex } = (body ?? {}) as { beef?: unknown, outputIndex?: unknown }
  if (!Number.isSafeInteger(outputIndex) || (outputIndex as number) < 0) throw new CreditError(400, 'ERR_BAD_REQUEST', 'outputIndex must be a non-negative integer')
  const vout = outputIndex as number
  const beef = parseBeef(rawBeef)
  let tx: Transaction
  let txid: string
  let parsed: Beef
  try {
    parsed = Beef.fromBinary(beef)
    txid = parsed.atomicTxid ?? parsed.txs[parsed.txs.length - 1].txid
    tx = Transaction.fromBEEF(beef, txid)
  } catch {
    throw new CreditError(400, 'ERR_BAD_REQUEST', 'beef does not parse')
  }
  const output = tx.outputs[vout]
  if (output === undefined) throw new CreditError(400, 'ERR_BAD_REQUEST', `transaction has no output ${vout}`)

  // 1. a transfer of one of our credit tokens
  const decoded = decodeBsv21(output.lockingScript)
  if (decoded === null || decoded.op !== 'transfer') throw new CreditError(400, 'ERR_NOT_CREDITS', 'output is not a BSV-21 transfer')
  const product = deps.products.find(p => p.tokenId !== null && p.tokenId === decoded.id)
  if (product === undefined) throw new CreditError(400, 'ERR_WRONG_TOKEN', `token ${String(decoded.id)} is not a credit token of this provider`)
  const tokenId = product.tokenId!

  // 3. size of this redeem (the pending cap is checked atomically below)
  if (decoded.amount < 1n || decoded.amount > BigInt(MAX_REDEEM_CREDITS)) {
    throw new CreditError(400, 'ERR_REDEEM_LIMIT', `redeem 1 to ${MAX_REDEEM_CREDITS} credits at a time (got ${decoded.amount})`)
  }
  const credits = Number(decoded.amount)

  // 2. locked to one of our receive addresses
  const me = await deps.kit.identityKey()
  const scan = (await deps.kit.nextIndex(me)) + GAP_LIMIT
  let index = -1
  for (let i = 0; i <= scan && index === -1; i++) if (receivePkh(me, i) === decoded.ownerPkh) index = i
  if (index === -1) throw new CreditError(400, 'ERR_NOT_OURS', 'output is not locked to a provider-api token address')

  // 6 (early). already redeemed
  const outpoint = `${txid}.${vout}`
  if (deps.ledger.isRedeemed(outpoint)) throw new CreditError(409, 'ERR_REDEEM_REPLAYED', 'these credits were already redeemed')

  // 4. the caller's own tokens paid for it
  const callerOutputs = new Set((await deps.overlay.lookup({ op: 'identity', identityKey: caller, tokenId, includeSpent: true }))
    .map(o => `${o.txid}.${o.vout}`))
  const spendsOwn = tx.inputs.some(i => callerOutputs.has(`${i.sourceTXID ?? i.sourceTransaction?.id('hex')}.${i.sourceOutputIndex}`))
  if (!spendsOwn) throw new CreditError(403, 'ERR_NOT_SENDER', 'only the identity that sent these credits can redeem them')

  // 5. genuine credits
  const lineageDepth = await checkLineage(deps, parsed, txid, vout, { tokenId, amount: decoded.amount, ownerPkh: decoded.ownerPkh })

  // 3 + 6, atomically: claim the outpoint and room under the pending cap
  const mpc = unitsPerCredit(product)
  const reserved = deps.ledger.reserveRedeem(outpoint, caller, tokenId, credits * mpc, MAX_PENDING_REDEEM_CREDITS * mpc)
  if (reserved === 'replayed') throw new CreditError(409, 'ERR_REDEEM_REPLAYED', 'these credits were already redeemed')
  if (reserved === 'over-limit') {
    const have = deps.ledger.balance(caller, tokenId) / mpc
    throw new CreditError(400, 'ERR_REDEEM_LIMIT', `prepaid balance would exceed ${MAX_PENDING_REDEEM_CREDITS} credits (have ${Number(have.toFixed(2))}); spend or return some first`)
  }
  try {
    await deps.wallet.internalizeAction({
      tx: tx.toAtomicBEEF(),
      outputs: [{
        outputIndex: vout,
        protocol: 'basket insertion',
        insertionRemittance: {
          basket: TOKEN_BASKET,
          customInstructions: JSON.stringify(instructionsFor(index)),
          tags: ['bsv21', `id:${tokenId}`, `amt:${credits}`]
        }
      }],
      labels: ['bsv21', 'agentcoop redeem'],
      description: `Redeem ${credits} ${product.unit} credits`.slice(0, 50)
    })
  } catch (e) {
    deps.ledger.releaseRedeem(outpoint)
    throw new CreditError(400, 'ERR_REDEEM_FAILED', `the wallet did not accept the transfer: ${(e as Error).message}`)
  }
  const prepaidUnits = deps.ledger.commitRedeem(outpoint)
  return { outpoint, product: product.id, tokenId, credits, prepaidUnits, ...(runnerIdOf(product) === 'gpu' ? { prepaidMinutes: prepaidUnits } : {}), lineageDepth }
}

export async function returnCredits (deps: CreditDeps, caller: string, body: unknown): Promise<{ txid: string, product: string, credits: number, prepaidUnits: number, prepaidMinutes?: number }> {
  const b = (body ?? {}) as { credits?: unknown, product?: unknown }
  const product = b.product === undefined ? defaultProduct(deps.products.filter(p => p.tokenId !== null)) : deps.products.find(p => p.id === b.product)
  if (product?.tokenId == null) throw new CreditError(400, 'ERR_BAD_REQUEST', 'no such product with a credit token')
  const credits = b.credits
  if (typeof credits !== 'number' || !Number.isSafeInteger(credits) || credits < 1) throw new CreditError(400, 'ERR_BAD_REQUEST', 'credits must be a positive integer')
  const minutes = credits * unitsPerCredit(product)
  if (!deps.ledger.tryDebit(caller, product.tokenId, minutes)) {
    const have = deps.ledger.balance(caller, product.tokenId)
    throw new CreditError(400, 'ERR_INSUFFICIENT_CREDITS', `prepaid balance is ${have} units = ${Math.floor(have / unitsPerCredit(product))} whole credits`)
  }
  try {
    const { txid } = await deps.kit.send(product.tokenId, BigInt(credits), caller)
    const prepaidUnits = deps.ledger.balance(caller, product.tokenId)
    return { txid, product: product.id, credits, prepaidUnits, ...(runnerIdOf(product) === 'gpu' ? { prepaidMinutes: prepaidUnits } : {}) }
  } catch (e) {
    deps.ledger.refund(caller, product.tokenId, minutes)
    throw new CreditError(502, 'ERR_RETURN_FAILED', `could not send the credits back: ${(e as Error).message}`)
  }
}
