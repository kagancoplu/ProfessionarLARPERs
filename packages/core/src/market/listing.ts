/**
 * Market (track A 2.3–2.4, FINAL-IDEA §4.8): signed listings and one-transaction sweeps.
 *
 * A listing is the provider-offer primitive again: the seller's credit UTXO
 * signed SINGLE|ANYONECANPAY|FORKID against "the output at my index pays me
 * askSats". A buyer puts listing i at input i and its payment at output i,
 * then adds one credit output to itself, funding and change, and signs ALL.
 * No covenant; the seller can be offline; cancelling = spending the UTXO.
 */
import { Beef, Random, Transaction, UnlockingScript, Utils, type WalletInterface } from '../sdk'
import { buildBsv21Script } from '../kit/inscription'
import { decodeBsv21Owned } from '../scripts/creditLock'
import { instructionsFor, receivePkh, TOKEN_BASKET } from '../kit/addresses'
import { beefFromArcade } from '../kit/overlayApi'
import type { TokenKit } from '../kit/token'
import { AgentCoopError } from '../errors'
import { buildOpReturn } from '../scripts/opreturn'
import { signP2pkhWithScope } from '../signers/sighash'
import { derivedP2pkhHex, reserveTokens, type OfferKey } from '../pool/reserve'
import { offerSkeleton } from '../pool/offer'
import { ARCADE_URL, LISTINGS_BASKET, MARKET_PROTOCOL, OFFERS_BASKET, P2PKH_UNLOCKING_SCRIPT_LENGTH, SIGHASH_SINGLE_ACP_FORKID, type Listing } from '../types'
import { coopOutpoint, parseOutpoint, toWalletOutpoint } from '../util/outpoint'
import { inputScriptValid } from '../util/spend'
import { verifyLineage, type LineageOptions } from '../verify/lineage'

export interface ListingInstructions extends OfferKey {
  counterparty: 'anyone'
  payKeyID: string
  tokenId: string
  credits: string
  askSats: string
}

/** Move `credits` to a listing key (basket 'agentcoop listings') and announce it with OP_RETURN list. */
export async function reserveListing (
  wallet: WalletInterface,
  kit: TokenKit,
  tokenId: string,
  credits: string,
  askSats: string,
  opts: { originator?: string } = {}
): Promise<{ txid: string, outpoint: string, beef: number[] }> {
  if (!/^[1-9]\d*$/.test(credits) || !/^[1-9]\d*$/.test(askSats)) throw new AgentCoopError('BAD_LISTING', 'credits and askSats must be positive integer strings')
  const nonce = Utils.toHex(Random(12))
  const key: OfferKey = { protocolID: MARKET_PROTOCOL, keyID: `list ${nonce}` }
  const instructions: ListingInstructions = { ...key, counterparty: 'anyone', payKeyID: `pay ${nonce}`, tokenId, credits, askSats }
  const seller = await kit.identityKey()
  const { txid, tx } = await reserveTokens(wallet, kit, {
    tokenId, amount: BigInt(credits), key, basket: LISTINGS_BASKET, instructions,
    opReturnHex: buildOpReturn('list', { v: '1', tokenId, credits, askSats, seller }).toHex(),
    description: 'AgentCoop: list credits'
  }, opts.originator ?? kit.originator)
  return { txid, outpoint: coopOutpoint(txid, 0), beef: tx }
}

/** Sign a reserved listing SINGLE|ACP (MASTER §3.4 signListing). */
export async function signListing (
  wallet: WalletInterface,
  outpoint: string,
  askSats: string,
  opts: { originator?: string, sourceTx?: Transaction } = {}
): Promise<Listing> {
  const { txid, vout } = parseOutpoint(outpoint)
  const res = await wallet.listOutputs({ basket: LISTINGS_BASKET, include: 'entire transactions', includeCustomInstructions: true, limit: 1000 }, opts.originator)
  const entry = res.outputs.find(o => o.outpoint === toWalletOutpoint(outpoint))
  if (entry?.customInstructions === undefined) throw new AgentCoopError('BAD_LISTING', `${outpoint} is not in the '${LISTINGS_BASKET}' basket`)
  const ins = JSON.parse(entry.customInstructions) as ListingInstructions
  if (ins.askSats !== askSats) throw new AgentCoopError('BAD_LISTING', `listing was announced at ${ins.askSats} sats`)
  const sourceTx = opts.sourceTx ?? (res.BEEF !== undefined ? Beef.fromBinary(Array.from(res.BEEF)).findTxid(txid)?.tx : undefined)
  if (sourceTx === undefined) throw new AgentCoopError('BAD_LISTING', `no source transaction for ${outpoint}`)
  const payScriptHex = await derivedP2pkhHex(wallet, MARKET_PROTOCOL, ins.payKeyID, opts.originator)
  const skeleton = offerSkeleton(sourceTx, vout, { payScriptHex, priceSats: askSats })
  const unlock = await signP2pkhWithScope(wallet, skeleton, 0, { protocolID: ins.protocolID, keyID: ins.keyID }, SIGHASH_SINGLE_ACP_FORKID, opts.originator)
  const { publicKey: seller } = await wallet.getPublicKey({ identityKey: true }, opts.originator)
  return {
    outpoint, tokenId: ins.tokenId, credits: ins.credits, askSats, seller,
    unlockingScriptHex: unlock.toHex(), lockingScriptHex: sourceTx.outputs[vout].lockingScript.toHex(), payScriptHex
  }
}

/** Offline checks of a listing against its source transaction (like verifyOffer). Lineage is separate. */
export function verifyListing (listing: Listing, opts: { sourceTx: Transaction }): void {
  const bad = (msg: string): never => { throw new AgentCoopError('BAD_LISTING', msg) }
  const { txid, vout } = parseOutpoint(listing.outpoint)
  if (opts.sourceTx.id('hex') !== txid) bad('source transaction does not match the outpoint')
  const out = opts.sourceTx.outputs[vout]
  if (out === undefined || out.lockingScript.toHex() !== listing.lockingScriptHex) bad('locking script mismatch')
  // P2PKH-owned credits, or vault-locked ones listed by agent + guard (signVaultCreditListing).
  const d = decodeBsv21Owned(out.lockingScript)
  if (d === null || d.op !== 'transfer' || d.id !== listing.tokenId || d.amount !== BigInt(listing.credits)) bad('listed UTXO does not carry the listed credits')
  const unlock = UnlockingScript.fromHex(listing.unlockingScriptHex)
  // P2PKH: <sig> <pubkey>; vault (cosign branch): OP_0 <sig> <sig> OP_0. Every signature must be SINGLE|ACP.
  const sigs = d!.owner.kind === 'vault' ? unlock.chunks.slice(1, 3).map(c => c.data) : [unlock.chunks[0]?.data]
  if (sigs.some(sig => sig === undefined || sig.length === 0 || sig[sig.length - 1] !== SIGHASH_SINGLE_ACP_FORKID)) bad('listing signature is not SINGLE|ANYONECANPAY|FORKID')
  const tx = offerSkeleton(opts.sourceTx, vout, { payScriptHex: listing.payScriptHex, priceSats: listing.askSats })
  tx.inputs[0].unlockingScript = unlock
  if (!inputScriptValid(tx, 0)) bad('listing signature does not verify')
}

/**
 * T8 — buy several listings of one token in a single transaction.
 * Every listing's credits are walked back to the deploy first (verifyLineage),
 * so a fake listing can never cost the buyer anything.
 */
export async function buildSweep (
  wallet: WalletInterface,
  kit: TokenKit,
  listings: Listing[],
  opts: { originator?: string, verifyLineage?: boolean, lineage?: LineageOptions, getBeef?: (txid: string) => Promise<number[]> } = {}
): Promise<{ txid: string, credits: string, tx: Transaction }> {
  if (listings.length === 0) throw new AgentCoopError('BAD_LISTING', 'nothing to sweep')
  const tokenId = listings[0].tokenId
  if (listings.some(l => l.tokenId !== tokenId)) throw new AgentCoopError('BAD_LISTING', 'one token per sweep')
  const getBeef = opts.getBeef ?? (async (txid: string) => await beefFromArcade(txid, opts.lineage?.arcadeUrl ?? ARCADE_URL))
  const beef = new Beef()
  for (const l of listings) {
    const { txid } = parseOutpoint(l.outpoint)
    const b = await getBeef(txid)
    beef.mergeBeef(b)
    verifyListing(l, { sourceTx: Transaction.fromBEEF(b, txid) })
    if (opts.verifyLineage !== false) {
      const vaultLocked = decodeBsv21Owned(l.lockingScriptHex)?.owner.kind === 'vault'
      // A lineage cache is per ownerKinds setting: a vault-locked listing walks without the caller's cache.
      const { cache: _cache, ...lineage } = opts.lineage ?? {}
      const r = await verifyLineage(l.outpoint, vaultLocked ? { ...lineage, ownerKinds: ['p2pkh', 'vault'] } : opts.lineage)
      if (!r.ok || r.tokenId !== tokenId || r.amt !== BigInt(l.credits)) throw new AgentCoopError('LINEAGE_FAILED', `${l.outpoint}: ${r.reason ?? 'credits do not match the listing'}`)
    }
  }
  const me = await kit.identityKey()
  const index = await kit.nextIndex(me)
  const total = listings.reduce((s, l) => s + BigInt(l.credits), 0n)
  const creditScript = buildBsv21Script({ op: 'transfer', id: tokenId, amt: total.toString() }, receivePkh(me, index)).toHex()
  const res = await wallet.createAction({
    description: `AgentCoop: buy ${listings.length} listing(s)`.slice(0, 50),
    labels: ['agentcoop', 'bsv21'],
    inputBEEF: beef.toBinary(),
    inputs: listings.map(l => ({ outpoint: toWalletOutpoint(l.outpoint), unlockingScript: l.unlockingScriptHex, inputDescription: 'AgentCoop listing' })),
    outputs: [
      ...listings.map(l => ({ lockingScript: l.payScriptHex, satoshis: Number(l.askSats), outputDescription: 'Pay the seller' })),
      { lockingScript: creditScript, satoshis: 1, outputDescription: 'Bought credits', basket: TOKEN_BASKET, customInstructions: JSON.stringify(instructionsFor(index)), tags: ['bsv21', `id:${tokenId}`, `amt:${total}`] }
    ],
    options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
  }, opts.originator ?? kit.originator)
  if (res.txid === undefined || res.tx === undefined) throw new Error('sweep was not completed by the wallet')
  const tx = Transaction.fromAtomicBEEF(res.tx)
  listings.forEach((l, i) => {
    const { txid, vout } = parseOutpoint(l.outpoint)
    if ((tx.inputs[i].sourceTXID ?? tx.inputs[i].sourceTransaction?.id('hex')) !== txid || tx.inputs[i].sourceOutputIndex !== vout) throw new Error(`listing ${l.outpoint} is not at input ${i}`)
  })
  await kit.overlay.submit(res.tx)
  return { txid: res.txid, credits: total.toString(), tx }
}

/**
 * Take reserved credits (a pool offer or a listing) back to my own token
 * address. Cancels the offer/listing: its signature now spends nothing.
 */
export async function reclaimReserved (
  wallet: WalletInterface,
  kit: TokenKit,
  outpoint: string,
  basket: typeof OFFERS_BASKET | typeof LISTINGS_BASKET,
  opts: { originator?: string } = {}
): Promise<string> {
  const originator = opts.originator ?? kit.originator
  const { txid, vout } = parseOutpoint(outpoint)
  const res = await wallet.listOutputs({ basket, include: 'entire transactions', includeCustomInstructions: true, limit: 1000 }, originator)
  const entry = res.outputs.find(o => o.outpoint === toWalletOutpoint(outpoint))
  if (entry?.customInstructions === undefined || res.BEEF === undefined) throw new AgentCoopError('BAD_LISTING', `${outpoint} is not in the '${basket}' basket`)
  const ins = JSON.parse(entry.customInstructions) as { protocolID: OfferKey['protocolID'], keyID: string, tokenId: string, credits: string }
  const me = await kit.identityKey()
  const index = await kit.nextIndex(me)
  const beef = Array.from(res.BEEF)
  const created = await wallet.createAction({
    description: 'AgentCoop: cancel and reclaim credits',
    labels: ['agentcoop', 'bsv21'],
    inputBEEF: beef,
    inputs: [{ outpoint: toWalletOutpoint(outpoint), unlockingScriptLength: P2PKH_UNLOCKING_SCRIPT_LENGTH, inputDescription: 'Reserved credits' }],
    outputs: [{
      lockingScript: buildBsv21Script({ op: 'transfer', id: ins.tokenId, amt: ins.credits }, receivePkh(me, index)).toHex(),
      satoshis: 1, outputDescription: 'Credits back to me', basket: TOKEN_BASKET,
      customInstructions: JSON.stringify(instructionsFor(index)), tags: ['bsv21', `id:${ins.tokenId}`, `amt:${ins.credits}`]
    }],
    options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
  }, originator)
  const signable = created.signableTransaction
  if (signable === undefined) throw new Error('wallet did not return a signable transaction')
  const tx = Transaction.fromAtomicBEEF(signable.tx)
  const i = tx.inputs.findIndex(inp => (inp.sourceTXID ?? inp.sourceTransaction?.id('hex')) === txid && inp.sourceOutputIndex === vout)
  if (i === -1) throw new Error('reserved credits missing from signable transaction')
  if (tx.inputs[i].sourceTransaction === undefined) tx.inputs[i].sourceTransaction = Beef.fromBinary(beef).findTxid(txid)?.tx
  const unlock = await signP2pkhWithScope(wallet, tx, i, { protocolID: ins.protocolID, keyID: ins.keyID }, undefined, originator)
  const signed = await wallet.signAction({ reference: signable.reference, spends: { [i]: { unlockingScript: unlock.toHex() } }, options: { acceptDelayedBroadcast: false } }, originator)
  if (signed.txid === undefined || signed.tx === undefined) throw new Error('wallet did not complete the reclaim')
  await kit.overlay.submit(signed.tx)
  return signed.txid
}

/** Cancel an open pool (C's provider-cli `cancel-pool`): reclaim the offer's credits. */
export const cancelPool = async (wallet: WalletInterface, kit: TokenKit, poolId: string, opts: { originator?: string } = {}): Promise<string> =>
  await reclaimReserved(wallet, kit, poolId, OFFERS_BASKET, opts)

/** Cancel a listing: reclaim its credits. */
export const cancelListing = async (wallet: WalletInterface, kit: TokenKit, outpoint: string, opts: { originator?: string } = {}): Promise<string> =>
  await reclaimReserved(wallet, kit, outpoint, LISTINGS_BASKET, opts)

