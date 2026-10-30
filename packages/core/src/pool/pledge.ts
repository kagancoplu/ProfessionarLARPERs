/**
 * T3 / T4 — pledge and cancel (track A 1.3, FINAL-IDEA §4.3 steps 2–3).
 *
 *   out 0   pledge coin: P2PKH([1,'agentcoop pledge'], keyID = nonce, 'anyone')   basket 'agentcoop'
 *   out 1   feeSats → terms.payScriptHex (non-refundable registration fee, anti-griefing)
 *   out 2   OP_RETURN agentcoop pledge { PledgeRecord }
 *
 * One active pledge per basket (blind-hash-signing damage bound, FINAL-IDEA §4.9).
 */
import { Beef, LockingScript, Random, Transaction, Utils, type WalletInterface } from '../sdk'
import { AgentCoopError } from '../errors'
import { buildOpReturn } from '../scripts/opreturn'
import { signP2pkhWithScope } from '../signers/sighash'
import { PLEDGE_BASKET, PLEDGE_PROTOCOL, P2PKH_UNLOCKING_SCRIPT_LENGTH, type PledgeRecord, type PoolTerms } from '../types'
import { coopOutpoint, parseOutpoint, toWalletOutpoint } from '../util/outpoint'
import { derivedP2pkhHex } from './reserve'
import { creditsCost, validateTerms } from './terms'

/** customInstructions stored with a pledge coin. */
export interface PledgeInstructions {
  protocolID: typeof PLEDGE_PROTOCOL
  keyID: string
  counterparty: 'anyone'
  poolId: string
}

export const DEFAULT_PLEDGE_BUFFER_SATS = 300

/** Coin size: share of P + 1 sat for the credit output + a fee buffer (the rest comes back as change). */
export const pledgeAmount = (terms: PoolTerms, credits: string, bufferSats = DEFAULT_PLEDGE_BUFFER_SATS): number =>
  Number(creditsCost(terms, credits)) + 1 + bufferSats

export async function buildPledge (
  wallet: WalletInterface,
  terms: PoolTerms,
  credits: string,
  signer: 'p2pkh' | 'vault',
  vaultScript?: LockingScript,
  opts: { tokenIndex: number, originator?: string, bufferSats?: number, allowMultiple?: boolean } = { tokenIndex: 0 }
): Promise<{ txid: string, outpoint: string, record: PledgeRecord, instructions: PledgeInstructions, satoshis: number, beef: number[] }> {
  validateTerms(terms)
  if (signer === 'vault' || vaultScript !== undefined) throw new AgentCoopError('NOT_IMPLEMENTED', 'vault pledges arrive in track A Faz 3')
  if (BigInt(credits) < BigInt(terms.minCredits) || BigInt(credits) > BigInt(terms.credits)) throw new AgentCoopError('BAD_PLEDGE', `credits must be in ${terms.minCredits}..${terms.credits}`)
  if (opts.allowMultiple !== true) {
    // Settlement change also lands in this basket (marked change:true); it is not a pledge.
    const active = await wallet.listOutputs({ basket: PLEDGE_BASKET, includeCustomInstructions: true, limit: 1000 }, opts.originator)
    const isPledge = (ci?: string): boolean => { try { return ci === undefined || JSON.parse(ci).change !== true } catch { return true } }
    if (active.outputs.some(o => o.spendable && isPledge(o.customInstructions))) throw new AgentCoopError('BAD_PLEDGE', `an active pledge already exists in '${PLEDGE_BASKET}' (one at a time)`)
  }
  const { publicKey: participant } = await wallet.getPublicKey({ identityKey: true }, opts.originator)
  const keyID = Utils.toHex(Random(12))
  const coinScript = await derivedP2pkhHex(wallet, PLEDGE_PROTOCOL, keyID, opts.originator)
  const satoshis = pledgeAmount(terms, credits, opts.bufferSats)
  const record: PledgeRecord = { v: '1', poolId: terms.poolId, credits, participant, tokenIndex: String(opts.tokenIndex), signer }
  const instructions: PledgeInstructions = { protocolID: PLEDGE_PROTOCOL, keyID, counterparty: 'anyone', poolId: terms.poolId }
  const res = await wallet.createAction({
    description: 'AgentCoop: pledge to pool',
    labels: ['agentcoop'],
    outputs: [
      { lockingScript: coinScript, satoshis, outputDescription: 'AgentCoop pledge coin', basket: PLEDGE_BASKET, customInstructions: JSON.stringify(instructions), tags: ['agentcoop', `pool:${terms.poolId}`] },
      { lockingScript: terms.payScriptHex, satoshis: Number(terms.feeSats), outputDescription: 'AgentCoop registration fee' },
      { lockingScript: buildOpReturn('pledge', record).toHex(), satoshis: 0, outputDescription: 'AgentCoop pledge record' }
    ],
    options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
  }, opts.originator)
  if (res.txid === undefined || res.tx === undefined) throw new Error('pledge was not completed by the wallet')
  const vout = Transaction.fromAtomicBEEF(res.tx).outputs.findIndex(o => o.lockingScript.toHex() === coinScript)
  return { txid: res.txid, outpoint: coopOutpoint(res.txid, vout), record, instructions, satoshis, beef: Array.from(res.tx) }
}

/** Withdraw (T4): spend the pledge coin back into the wallet's own funds. The pool's progress drops. */
export async function cancelPledge (wallet: WalletInterface, outpoint: string, opts: { originator?: string } = {}): Promise<string> {
  const { txid, vout } = parseOutpoint(outpoint)
  const res = await wallet.listOutputs({ basket: PLEDGE_BASKET, include: 'entire transactions', includeCustomInstructions: true, limit: 1000 }, opts.originator)
  const entry = res.outputs.find(o => o.outpoint === toWalletOutpoint(outpoint))
  if (entry?.customInstructions === undefined || res.BEEF === undefined) throw new AgentCoopError('BAD_PLEDGE', `pledge ${outpoint} is not in the '${PLEDGE_BASKET}' basket`)
  const ins = JSON.parse(entry.customInstructions) as PledgeInstructions
  const beef = Array.from(res.BEEF)
  const created = await wallet.createAction({
    description: 'AgentCoop: withdraw pledge',
    labels: ['agentcoop'],
    inputBEEF: beef,
    inputs: [{ outpoint: toWalletOutpoint(outpoint), unlockingScriptLength: P2PKH_UNLOCKING_SCRIPT_LENGTH, inputDescription: 'AgentCoop pledge coin' }],
    outputs: [],
    options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
  }, opts.originator)
  const signable = created.signableTransaction
  if (signable === undefined) throw new Error('wallet did not return a signable transaction')
  const tx = Transaction.fromAtomicBEEF(signable.tx)
  const i = tx.inputs.findIndex(inp => (inp.sourceTXID ?? inp.sourceTransaction?.id('hex')) === txid && inp.sourceOutputIndex === vout)
  if (i === -1) throw new Error('pledge coin missing from signable transaction')
  if (tx.inputs[i].sourceTransaction === undefined) tx.inputs[i].sourceTransaction = Beef.fromBinary(beef).findTxid(txid)?.tx
  const unlock = await signP2pkhWithScope(wallet, tx, i, { protocolID: ins.protocolID, keyID: ins.keyID }, undefined, opts.originator)
  const signed = await wallet.signAction({ reference: signable.reference, spends: { [i]: { unlockingScript: unlock.toHex() } }, options: { acceptDelayedBroadcast: false } }, opts.originator)
  if (signed.txid === undefined) throw new Error('wallet did not complete the withdrawal')
  return signed.txid
}
