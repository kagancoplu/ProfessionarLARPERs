/**
 * The provider's open offer (track A 1.2, FINAL-IDEA §4.3 step 1): the reserved
 * credit UTXO signed SINGLE|ANYONECANPAY|FORKID against output 0 = P sats to
 * payScript. Anyone can complete it; the provider can go offline.
 */
import { Beef, LockingScript, Transaction, UnlockingScript, type WalletInterface } from '../sdk'
import { decodeBsv21 } from '../kit/inscription'
import { AgentCoopError } from '../errors'
import { signP2pkhWithScope } from '../signers/sighash'
import { OFFERS_BASKET, SIGHASH_SINGLE_ACP_FORKID, type Offer, type PoolTerms } from '../types'
import { parseOutpoint, toWalletOutpoint } from '../util/outpoint'
import { inputScriptValid } from '../util/spend'
import type { OfferInstructions } from './reserve'
import { validateTerms } from './terms'

/** in 0 = offer UTXO, out 0 = P sats → payScript: everything the offer signature covers. */
export function offerSkeleton (sourceTx: Transaction, vout: number, terms: Pick<PoolTerms, 'payScriptHex' | 'priceSats'>): Transaction {
  const tx = new Transaction()
  tx.addInput({ sourceTransaction: sourceTx, sourceOutputIndex: vout, sequence: 0xffffffff })
  tx.addOutput({ lockingScript: LockingScript.fromHex(terms.payScriptHex), satoshis: Number(terms.priceSats) })
  return tx
}

export async function signOffer (
  wallet: WalletInterface,
  outpoint: string,
  terms: PoolTerms,
  opts: { sourceTx?: Transaction, originator?: string } = {}
): Promise<Offer> {
  validateTerms(terms)
  if (outpoint !== terms.poolId) throw new AgentCoopError('BAD_OFFER', 'outpoint must equal terms.poolId')
  const { txid, vout } = parseOutpoint(outpoint)
  const res = await wallet.listOutputs({ basket: OFFERS_BASKET, include: 'entire transactions', includeCustomInstructions: true, limit: 1000 }, opts.originator)
  const entry = res.outputs.find(o => o.outpoint === toWalletOutpoint(outpoint))
  if (entry?.customInstructions === undefined) throw new AgentCoopError('BAD_OFFER', `offer UTXO ${outpoint} is not in the '${OFFERS_BASKET}' basket`)
  const instructions = JSON.parse(entry.customInstructions) as OfferInstructions
  const sourceTx = opts.sourceTx ?? (res.BEEF !== undefined ? Beef.fromBinary(Array.from(res.BEEF)).findTxid(txid)?.tx : undefined)
  if (sourceTx === undefined) throw new AgentCoopError('BAD_OFFER', `no source transaction for ${outpoint}`)
  const tx = offerSkeleton(sourceTx, vout, terms)
  const unlock = await signP2pkhWithScope(wallet, tx, 0, { protocolID: instructions.protocolID, keyID: instructions.keyID }, SIGHASH_SINGLE_ACP_FORKID, opts.originator)
  const out = sourceTx.outputs[vout]
  return { poolId: outpoint, unlockingScriptHex: unlock.toHex(), lockingScriptHex: out.lockingScript.toHex(), satoshis: out.satoshis!, terms }
}

/**
 * Offline checks of an offer against its source transaction: the UTXO really
 * carries N credits of tokenId (as encoded; lineage is Faz 2), the signature
 * is SINGLE|ACP and valid for "output 0 pays P to payScript".
 * Unspent-ness needs the network (overlay / Arcade) and is checked by callers.
 */
export function verifyOffer (offer: Offer, opts: { sourceTx: Transaction }): void {
  const bad = (msg: string): never => { throw new AgentCoopError('BAD_OFFER', msg) }
  validateTerms(offer.terms)
  if (offer.poolId !== offer.terms.poolId) bad('poolId mismatch')
  const { txid, vout } = parseOutpoint(offer.poolId)
  if (opts.sourceTx.id('hex') !== txid) bad('source transaction does not match poolId')
  const out = opts.sourceTx.outputs[vout]
  if (out === undefined) bad('poolId output does not exist')
  if (out.lockingScript.toHex() !== offer.lockingScriptHex || out.satoshis !== offer.satoshis) bad('locking script / satoshis mismatch')
  const d = decodeBsv21(out.lockingScript)
  if (d === null || d.op === 'burn') bad('offer UTXO is not a BSV-21 credit output')
  const tokenId = d!.op === 'deploy+mint' ? offer.poolId : d!.id!
  if (tokenId !== offer.terms.tokenId) bad('offer UTXO carries another token')
  if (d!.amount !== BigInt(offer.terms.credits)) bad(`offer UTXO carries ${d!.amount} credits, terms say ${offer.terms.credits}`)
  const unlock = UnlockingScript.fromHex(offer.unlockingScriptHex)
  const sig = unlock.chunks[0]?.data
  if (sig === undefined || sig[sig.length - 1] !== SIGHASH_SINGLE_ACP_FORKID) bad('offer signature is not SINGLE|ANYONECANPAY|FORKID')
  const tx = offerSkeleton(opts.sourceTx, vout, offer.terms)
  tx.inputs[0].unlockingScript = unlock
  if (!inputScriptValid(tx, 0)) bad('offer signature does not verify')
}
