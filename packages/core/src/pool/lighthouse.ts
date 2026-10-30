/**
 * Lighthouse mode (track A 5.5–5.6): a human pledges once and goes offline.
 *
 *   pledge tx   out 0  exact coin (share + 1 + feeSats) on lighthouseLockingScript   basket 'agentcoop lighthouse'
 *               out 1  terms.feeSats → payScriptHex (registration fee)
 *               out 2  OP_RETURN agentcoop pledge { …, signer:'vault', mode:'lighthouse', guard, lhId }
 *   then        the human signs the coin SINGLE|ANYONECANPAY against ONE output: k credits to its own
 *               receive address. BIP-143 leaves the input index out of the preimage, so the signature
 *               holds wherever the coordinator puts the coin, as long as the output at the same index is
 *               that credit output (the settlement layout is in i ↔ out i).
 *   settlement  the guard the human named co-signs ALL after verifySettlementPlan + verifyLineage
 *               (cosignLighthouse). Without it nobody can spend the coin with a fake credit output.
 *   any time    the human withdraws alone (cancelLighthousePledge, OP_IF branch, its separate withdraw key).
 *
 * LighthousePledge is off-chain data (the coordinator stores it, MASTER §3.5 POST /pledges/lighthouse).
 */
import { BigNumber, ECDSA, LockingScript, PublicKey, Signature, Transaction, Utils, type UnlockingScript, type WalletInterface } from '../sdk'
import { AgentCoopError } from '../errors'
import { buildBsv21Script } from '../kit/inscription'
import { receivePkh } from '../kit/addresses'
import { buildOpReturn } from '../scripts/opreturn'
import { isLighthouseRecord, lighthouseLockingScript, lighthouseWithdrawKeyID, scriptSighash, type LighthouseRecord } from '../scripts/lighthouse'
import { deriveVaultPub, newVaultId, vaultCosignUnlock, vaultOwnerUnlock, VAULT_COSIGN_UNLOCK_LENGTH, VAULT_OWNER_UNLOCK_LENGTH } from '../scripts/vault'
import { LIGHTHOUSE_BASKET, SIGHASH_ALL_FORKID, SIGHASH_SINGLE_ACP_FORKID, VAULT_PROTOCOL, type Offer, type PoolTerms, type SettlementPlan } from '../types'
import { coopOutpoint, parseOutpoint, toWalletOutpoint } from '../util/outpoint'
import { creditsCost, validateTerms } from './terms'
import { pledgeRecordOf, planTransaction, verifySettlementPlan } from './verify'
import type { LineageOptions } from '../verify/lineage'

/** What a lighthouse coin carries for the miner by default, on top of its share and its credit output. */
export const DEFAULT_LIGHTHOUSE_FEE_SATS = 100

export interface LighthousePledge {
  outpoint: string                    // txid_vout of the coin (vout 0)
  record: LighthouseRecord
  satoshis: number
  /** checksig format: DER ‖ 0xc3 (SINGLE|ANYONECANPAY|FORKID). */
  humanSignatureHex: string
  /** The output the signature is bound to: k credits → receivePkh(participant, tokenIndex). */
  creditLockingScriptHex: string
  /** AtomicBEEF of the pledge transaction: submit it to tm_agentcoop. */
  beef: number[]
}

export interface LighthouseInstructions { mode: 'lighthouse', protocolID: typeof VAULT_PROTOCOL, keyID: string, counterparty: 'anyone', poolId: string }

const creditScript = (tokenId: string, r: LighthouseRecord): LockingScript =>
  buildBsv21Script({ op: 'transfer', id: tokenId, amt: r.credits }, receivePkh(r.participant, Number(r.tokenIndex)))

/** The one-input, one-output transaction the human signs (in 0 = coin ↔ out 0 = its credits). */
export function lighthouseSkeleton (pledgeTx: Transaction, vout: number, creditLockingScriptHex: string): Transaction {
  const tx = new Transaction()
  tx.addInput({ sourceTransaction: pledgeTx, sourceOutputIndex: vout, sequence: 0xffffffff })
  tx.addOutput({ lockingScript: LockingScript.fromHex(creditLockingScriptHex), satoshis: 1 })
  return tx
}

async function signScope (wallet: WalletInterface, sighash: number[], lhId: string, scope: number, originator?: string): Promise<number[]> {
  const { signature } = await wallet.createSignature({ hashToDirectlySign: sighash, protocolID: VAULT_PROTOCOL, keyID: lhId, counterparty: 'anyone' }, originator)
  return [...signature, scope]
}

function sigValid (pub: string, sighash: number[], checksig: number[], scope: number): boolean {
  try {
    if (checksig.length < 9 || checksig[checksig.length - 1] !== scope) return false
    return ECDSA.verify(new BigNumber(sighash), Signature.fromDER(checksig.slice(0, -1)), PublicKey.fromString(pub))
  } catch { return false }
}

/** Human side: create the exact coin and sign it, once. Then the human can go offline. */
export async function buildLighthousePledge (
  wallet: WalletInterface,
  terms: PoolTerms,
  credits: string,
  opts: { tokenIndex: number, guard: string, feeSats?: number, originator?: string }
): Promise<LighthousePledge> {
  validateTerms(terms)
  if (BigInt(credits) < BigInt(terms.minCredits) || BigInt(credits) > BigInt(terms.credits)) throw new AgentCoopError('BAD_PLEDGE', `credits must be in ${terms.minCredits}..${terms.credits}`)
  const { publicKey: participant } = await wallet.getPublicKey({ identityKey: true }, opts.originator)
  if (opts.guard === participant) throw new AgentCoopError('BAD_PLEDGE', 'the guard must be someone else (a 2-of-2 with yourself is a single signature)')
  const lhId = newVaultId()
  const record: LighthouseRecord = { v: '1', poolId: terms.poolId, credits, participant, tokenIndex: String(opts.tokenIndex), signer: 'vault', mode: 'lighthouse', guard: opts.guard, lhId }
  const coinScript = lighthouseLockingScript(record).toHex()
  const satoshis = Number(creditsCost(terms, credits)) + 1 + (opts.feeSats ?? DEFAULT_LIGHTHOUSE_FEE_SATS)
  const instructions: LighthouseInstructions = { mode: 'lighthouse', protocolID: VAULT_PROTOCOL, keyID: lhId, counterparty: 'anyone', poolId: terms.poolId }
  const res = await wallet.createAction({
    description: 'AgentCoop: lighthouse pledge',
    labels: ['agentcoop'],
    outputs: [
      { lockingScript: coinScript, satoshis, outputDescription: 'AgentCoop lighthouse coin', basket: LIGHTHOUSE_BASKET, customInstructions: JSON.stringify(instructions), tags: ['agentcoop', `pool:${terms.poolId}`] },
      { lockingScript: terms.payScriptHex, satoshis: Number(terms.feeSats), outputDescription: 'AgentCoop registration fee' },
      { lockingScript: buildOpReturn('pledge', record).toHex(), satoshis: 0, outputDescription: 'AgentCoop pledge record' }
    ],
    options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
  }, opts.originator)
  if (res.txid === undefined || res.tx === undefined) throw new Error('lighthouse pledge was not completed by the wallet')
  const pledgeTx = Transaction.fromAtomicBEEF(res.tx)
  const vout = pledgeTx.outputs.findIndex(o => o.lockingScript.toHex() === coinScript)
  const creditLockingScriptHex = creditScript(terms.tokenId, record).toHex()
  const skeleton = lighthouseSkeleton(pledgeTx, vout, creditLockingScriptHex)
  const sig = await signScope(wallet, scriptSighash(skeleton, 0, SIGHASH_SINGLE_ACP_FORKID), lhId, SIGHASH_SINGLE_ACP_FORKID, opts.originator)
  return { outpoint: coopOutpoint(res.txid, vout), record, satoshis, humanSignatureHex: Utils.toHex(sig), creditLockingScriptHex, beef: Array.from(res.tx) }
}

/**
 * Offline check of a LighthousePledge against its pledge transaction (coordinator on POST, guard
 * before co-signing): the on-chain record, the coin on the record's script, the credit output the
 * terms imply, and the human's SINGLE|ACP signature over it. Returns the on-chain record.
 */
export function verifyLighthousePledge (lp: LighthousePledge, opts: { sourceTx: Transaction, tokenId: string }): LighthouseRecord {
  const bad = (msg: string): never => { throw new AgentCoopError('BAD_PLEDGE', `lighthouse ${lp.outpoint}: ${msg}`) }
  const { txid, vout } = parseOutpoint(lp.outpoint)
  if (opts.sourceTx.id('hex') !== txid) bad('source transaction mismatch')
  const record = pledgeRecordOf(opts.sourceTx)
  if (!isLighthouseRecord(record)) return bad('no lighthouse pledge record')
  if (record.creditLock !== undefined) bad('a lighthouse pledge cannot lock its credits')
  const coin = opts.sourceTx.outputs[vout]
  if (coin?.lockingScript.toHex() !== lighthouseLockingScript(record).toHex()) bad('coin is not on the record\'s lighthouse script')
  if (lp.creditLockingScriptHex !== creditScript(opts.tokenId, record).toHex()) bad('credit output is not the record\'s')
  const sighash = scriptSighash(lighthouseSkeleton(opts.sourceTx, vout, lp.creditLockingScriptHex), 0, SIGHASH_SINGLE_ACP_FORKID)
  if (!sigValid(deriveVaultPub(record.participant, record.lhId), sighash, Utils.toArray(lp.humanSignatureHex, 'hex'), SIGHASH_SINGLE_ACP_FORKID)) bad('human signature does not verify')
  return record
}

/**
 * Guard side (D wires it to POST /cosign, kind 'lighthouse'): check the whole settlement as the
 * human would (DvP, fee cap, the offer's lineage), then add the guard's ALL signature next to
 * the human's. Throws AgentCoopError when anything is off; never signs blind.
 */
export async function cosignLighthouse (guardWallet: WalletInterface, args: {
  plan: SettlementPlan
  offer: Offer
  inputIndex: number
  pledge: LighthousePledge
  lineage?: LineageOptions
  /** Most the human pays in fees beyond its share (default: whatever its exact coin carries). */
  maxFeeSats?: number
  originator?: string
}): Promise<UnlockingScript> {
  const { plan, offer, inputIndex: i, pledge } = args
  const tx = planTransaction(plan)
  const input = tx.inputs[i]
  const { txid, vout } = parseOutpoint(pledge.outpoint)
  if (input === undefined || (input.sourceTXID ?? input.sourceTransaction?.id('hex')) !== txid || input.sourceOutputIndex !== vout) {
    throw new AgentCoopError('BAD_PLAN', `input ${i} is not ${pledge.outpoint}`)
  }
  const record = verifyLighthousePledge(pledge, { sourceTx: input.sourceTransaction!, tokenId: offer.terms.tokenId })
  const { publicKey: me } = await guardWallet.getPublicKey({ identityKey: true }, args.originator)
  if (record.guard !== me) throw new AgentCoopError('BAD_PLEDGE', `lighthouse ${pledge.outpoint} names another guard`)
  if (record.poolId !== plan.poolId || offer.poolId !== plan.poolId) throw new AgentCoopError('BAD_PLAN', `lighthouse ${pledge.outpoint} pledged to ${record.poolId}, not ${plan.poolId}`)
  const coinFee = pledge.satoshis - Number(creditsCost(offer.terms, record.credits)) - 1
  await verifySettlementPlan(plan, offer, pledge.outpoint, {
    expectedCredits: record.credits,
    expectedCreditPkh: receivePkh(record.participant, Number(record.tokenIndex)),
    maxFeeSats: args.maxFeeSats ?? coinFee,
    verifyLineage: true,
    lineage: args.lineage
  })
  const humanSig = Utils.toArray(pledge.humanSignatureHex, 'hex')
  if (!sigValid(deriveVaultPub(record.participant, record.lhId), scriptSighash(tx, i, SIGHASH_SINGLE_ACP_FORKID), humanSig, SIGHASH_SINGLE_ACP_FORKID)) {
    throw new AgentCoopError('BAD_SIGNATURE', `the human's signature does not cover input ${i} of this plan`)
  }
  const guardSig = await signScope(guardWallet, scriptSighash(tx, i, SIGHASH_ALL_FORKID), record.lhId, SIGHASH_ALL_FORKID, args.originator)
  return vaultCosignUnlock(humanSig, guardSig)
}

/** The guard's InputSigner length for a lighthouse input (OP_0 <sig> <sig> OP_0). */
export const LIGHTHOUSE_UNLOCKING_SCRIPT_LENGTH = VAULT_COSIGN_UNLOCK_LENGTH

/** Human side: take the coin back alone (OP_IF branch). The pool's progress drops. Submit `beef` to tm_agentcoop. */
export async function cancelLighthousePledge (wallet: WalletInterface, outpoint: string, opts: { originator?: string } = {}): Promise<{ txid: string, beef: number[] }> {
  const res = await wallet.listOutputs({ basket: LIGHTHOUSE_BASKET, include: 'entire transactions', includeCustomInstructions: true, limit: 1000 }, opts.originator)
  const entry = res.outputs.find(o => o.outpoint === toWalletOutpoint(outpoint))
  if (entry?.customInstructions === undefined || res.BEEF === undefined) throw new AgentCoopError('BAD_PLEDGE', `${outpoint} is not in the '${LIGHTHOUSE_BASKET}' basket`)
  const ins = JSON.parse(entry.customInstructions) as LighthouseInstructions
  const created = await wallet.createAction({
    description: 'AgentCoop: withdraw lighthouse pledge',
    labels: ['agentcoop'],
    inputBEEF: Array.from(res.BEEF),
    inputs: [{ outpoint: toWalletOutpoint(outpoint), unlockingScriptLength: VAULT_OWNER_UNLOCK_LENGTH, inputDescription: 'AgentCoop lighthouse coin' }],
    outputs: [],
    options: { randomizeOutputs: false, acceptDelayedBroadcast: false, signAndProcess: false }
  }, opts.originator)
  const signable = created.signableTransaction
  if (signable === undefined) throw new Error('createAction returned no signable transaction')
  try {
    const tx = Transaction.fromAtomicBEEF(signable.tx)
    const { txid, vout } = parseOutpoint(outpoint)
    const vi = tx.inputs.findIndex(i => (i.sourceTXID ?? i.sourceTransaction?.id('hex')) === txid && i.sourceOutputIndex === vout)
    if (vi < 0) throw new Error('lighthouse coin missing from the signable transaction')
    const sig = await signScope(wallet, scriptSighash(tx, vi, SIGHASH_ALL_FORKID), lighthouseWithdrawKeyID(ins.keyID), SIGHASH_ALL_FORKID, opts.originator)
    const signed = await wallet.signAction({ reference: signable.reference, spends: { [vi]: { unlockingScript: vaultOwnerUnlock(sig).toHex() } } }, opts.originator)
    const failed = signed.sendWithResults?.find(r => r.status === 'failed')
    if (signed.txid === undefined || signed.tx === undefined || failed !== undefined) throw new Error('withdrawal was not broadcast (already spent?)')
    return { txid: signed.txid, beef: Array.from(signed.tx) }
  } catch (e) {
    await wallet.abortAction({ reference: signable.reference }, opts.originator).catch(() => {})
    throw e
  }
}
