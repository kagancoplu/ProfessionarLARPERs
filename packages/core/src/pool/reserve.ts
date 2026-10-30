/**
 * T2 — reserve N credits in one UTXO and announce the pool, in one transaction
 * (track A 1.1, FINAL-IDEA §4.3 step 1).
 *
 *   inputs   validated token UTXOs of the provider (overlay BEEF)
 *   out 0    BSV-21 transfer N → P2PKH([1,'agentcoop provider'], `offer <nonce>`)   basket 'agentcoop offers'
 *   out 1    BSV-21 token change → provider's next receive address                  basket 'bsv21' (only if any)
 *   out 2    OP_RETURN agentcoop pool { terms − poolId, nonce }
 *
 * poolId = `<txid>_0`. The offer UTXO sits outside the token receive-address
 * scheme so TokenKit never spends it by accident (A-P1 §2.3).
 */
import { P2PKH, PublicKey, Random, Transaction, Utils, type WalletInterface, type WalletProtocol } from '../sdk'
import { buildBsv21Script } from '../kit/inscription'
import { instructionsFor, receivePkh, TOKEN_BASKET } from '../kit/addresses'
import { selectUtxos } from '../kit/coinselect'
import { P2PKH_UNLOCK_LENGTH, signWalletP2pkhInput } from '../kit/signer'
import type { TokenKit } from '../kit/token'
import { buildOpReturn } from '../scripts/opreturn'
import { OFFERS_BASKET, PROVIDER_PROTOCOL, type PoolTerms } from '../types'
import { coopOutpoint } from '../util/outpoint'
import { validateTerms } from './terms'

export interface OfferKey {
  protocolID: WalletProtocol
  keyID: string
}

/** customInstructions stored with the reserved offer UTXO. */
export interface OfferInstructions extends OfferKey {
  counterparty: 'anyone'
  /** keyID of the revenue key (payScript) under PROVIDER_PROTOCOL = the pool nonce. */
  payKeyID: string
  tokenId: string
  credits: string
}

export const offerKeyFor = (poolNonce: string): OfferKey => ({ protocolID: PROVIDER_PROTOCOL, keyID: `offer ${poolNonce}` })

/** HASH160 (hex) of the wallet's own key (protocolID, keyID, 'anyone'). */
export async function derivedPkh (wallet: Pick<WalletInterface, 'getPublicKey'>, protocolID: WalletProtocol, keyID: string, originator?: string): Promise<string> {
  const { publicKey } = await wallet.getPublicKey({ protocolID, keyID, counterparty: 'anyone', forSelf: true }, originator)
  return PublicKey.fromString(publicKey).toHash('hex') as string
}

export async function derivedP2pkhHex (wallet: Pick<WalletInterface, 'getPublicKey'>, protocolID: WalletProtocol, keyID: string, originator?: string): Promise<string> {
  return new P2PKH().lock(Utils.toArray(await derivedPkh(wallet, protocolID, keyID, originator), 'hex')).toHex()
}

export type TermsDraft = Omit<PoolTerms, 'poolId' | 'payScriptHex' | 'provider'> & { payScriptHex?: string }

/**
 * Move `amount` of `tokenId` from the wallet's validated token UTXOs to ONE
 * output at index 0 locked to a derived key outside the token receive-address
 * scheme (offers, listings), plus token change and an OP_RETURN. Used by
 * buildReserveAndAnnounce and reserveListing.
 */
export async function reserveTokens (
  wallet: WalletInterface,
  kit: TokenKit,
  args: { tokenId: string, amount: bigint, key: OfferKey, basket: string, instructions: object, opReturnHex: string, description: string },
  originator?: string
): Promise<{ txid: string, tx: number[] }> {
  const me = await kit.identityKey()
  const { entries, beef } = await kit.spendable(args.tokenId)
  const { selected, total } = selectUtxos(entries, args.amount)
  const pkh = await derivedPkh(wallet, args.key.protocolID, args.key.keyID, originator)
  const outputs: Parameters<WalletInterface['createAction']>[0]['outputs'] = [{
    lockingScript: buildBsv21Script({ op: 'transfer', id: args.tokenId, amt: args.amount.toString() }, pkh).toHex(),
    satoshis: 1,
    outputDescription: 'AgentCoop reserved credits',
    basket: args.basket,
    customInstructions: JSON.stringify(args.instructions),
    tags: ['agentcoop', `id:${args.tokenId}`, `amt:${args.amount}`]
  }]
  if (total > args.amount) {
    const index = await kit.nextIndex(me)
    outputs.push({
      lockingScript: buildBsv21Script({ op: 'transfer', id: args.tokenId, amt: (total - args.amount).toString() }, receivePkh(me, index)).toHex(),
      satoshis: 1,
      outputDescription: 'Token change',
      basket: TOKEN_BASKET,
      customInstructions: JSON.stringify(instructionsFor(index)),
      tags: ['bsv21', `id:${args.tokenId}`, `amt:${total - args.amount}`]
    })
  }
  outputs.push({ lockingScript: args.opReturnHex, satoshis: 0, outputDescription: 'AgentCoop record' })

  const created = await wallet.createAction({
    description: args.description.slice(0, 50),
    labels: ['agentcoop'],
    inputBEEF: beef,
    inputs: selected.map(u => ({ outpoint: u.outpoint, unlockingScriptLength: P2PKH_UNLOCK_LENGTH, inputDescription: 'BSV-21 credit input' })),
    outputs,
    options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
  }, originator)
  const signable = created.signableTransaction
  if (signable === undefined) throw new Error('wallet did not return a signable transaction')
  const tx = Transaction.fromAtomicBEEF(signable.tx)
  const spends: Record<number, { unlockingScript: string }> = {}
  for (const u of selected) {
    const i = tx.inputs.findIndex(inp => (inp.sourceTXID ?? inp.sourceTransaction?.id('hex')) === u.txid && inp.sourceOutputIndex === u.vout)
    if (i === -1) throw new Error(`token input ${u.outpoint} missing from signable transaction`)
    if (tx.inputs[i].sourceTransaction === undefined) tx.inputs[i].sourceTransaction = Transaction.fromBEEF(beef, u.txid)
    spends[i] = { unlockingScript: (await signWalletP2pkhInput(wallet, tx, i, { protocolID: u.instructions.protocolID, keyID: u.instructions.keyID }, originator)).toHex() }
  }
  const signed = await wallet.signAction({ reference: signable.reference, spends, options: { acceptDelayedBroadcast: false } }, originator)
  if (signed.txid === undefined || signed.tx === undefined) throw new Error('wallet did not complete the transaction')
  if (Transaction.fromAtomicBEEF(signed.tx).outputs[0].lockingScript.toHex() !== outputs[0].lockingScript) throw new Error('reserved credits are not at output 0')
  await kit.overlay.submit(signed.tx)
  return { txid: signed.txid, tx: Array.from(signed.tx) }
}

export async function buildReserveAndAnnounce (
  wallet: WalletInterface,
  kit: TokenKit,
  draft: TermsDraft,
  opts: { originator?: string, poolNonce?: string } = {}
): Promise<{ txid: string, poolId: string, terms: PoolTerms, offerKey: OfferKey, poolNonce: string, beef: number[] }> {
  const originator = opts.originator ?? kit.originator
  const poolNonce = opts.poolNonce ?? Utils.toHex(Random(12))
  const offerKey = offerKeyFor(poolNonce)
  const me = await kit.identityKey()
  const payScriptHex = draft.payScriptHex ?? await derivedP2pkhHex(wallet, PROVIDER_PROTOCOL, poolNonce, originator)
  const terms: PoolTerms = { ...draft, provider: me, payScriptHex, poolId: '' }
  validateTerms({ ...terms, poolId: 'x' })
  const instructions: OfferInstructions = { ...offerKey, counterparty: 'anyone', payKeyID: poolNonce, tokenId: draft.tokenId, credits: draft.credits }
  const { poolId: _omit, ...announced } = terms
  const { txid, tx } = await reserveTokens(wallet, kit, {
    tokenId: draft.tokenId,
    amount: BigInt(draft.credits),
    key: offerKey,
    basket: OFFERS_BASKET,
    instructions,
    opReturnHex: buildOpReturn('pool', { ...announced, nonce: poolNonce }).toHex(),
    description: 'AgentCoop: reserve credits and open pool'
  }, originator)
  const poolId = coopOutpoint(txid, 0)
  return { txid, poolId, terms: { ...terms, poolId }, offerKey, poolNonce, beef: tx }
}
