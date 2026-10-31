/**
 * Spending vault-locked credits (track A 5.4). After a settlement with
 * creditLock 'vault' the agent's credits sit on its vault script
 * (scripts/creditLock.ts). Moving them needs agent + guard (2-of-2) or the owner:
 *
 *   in 0      vault-locked credits (VaultSigner, guard context.kind 'redeem')
 *   in 1..    the agent wallet's own funding (miner fee)
 *   out 0     amt credits → toPkh (P2PKH: the provider's redeem address, proven with creditPayees)
 *   out 1     the rest, back on the same vault script (only when amt < the input)
 *   out 2..   wallet change
 *
 * Selling vault-locked credits is not a transfer: moving them to the agent's own
 * listing key would bypass the guard (D refuses it). signVaultCreditListing signs
 * the vault credit UTXO itself SINGLE|ANYONECANPAY (agent + guard, guard kind
 * 'list'), with the proceeds going back to the vault script: a market Listing
 * any buyer sweeps with buildSweep.
 *
 * The guard's policy for 'redeem' / 'list' (who may receive credits, how many) is
 * Track D's; this module only builds and signs. Overlays need the ownerKinds
 * ['p2pkh','vault'] rules to count the vault-locked input (Track B).
 */
import { Beef, Transaction, UnlockingScript, type WalletInterface } from '../sdk'
import { AgentCoopError } from '../errors'
import { buildBsv21Script } from '../kit/inscription'
import { buildVaultCreditScript, decodeBsv21Owned } from '../scripts/creditLock'
import { VAULT_COSIGN_UNLOCK_LENGTH, VAULT_LIST_SIGHASH } from '../scripts/vault'
import { offerSkeleton } from '../pool/offer'
import { VAULT_CREDITS_BASKET, type Listing, type SettlementPlan } from '../types'
import { coopOutpoint, parseOutpoint, toWalletOutpoint } from '../util/outpoint'
import { broadcastResult, reportCosigned, VaultSigner, vaultTag, type CosignContext, type Cosigner } from '../signers/VaultSigner'

export interface VaultCredit {
  /** "txid_vout" */
  outpoint: string
  tokenId: string
  amt: bigint
  lockingScriptHex: string
  /** BEEF holding the source transaction. */
  beef: number[]
}

interface VaultCreditInstructions { vaultId: string, tokenId: string, amt: string }

/** After a settlement: take my vault-locked credit output (1 + j) into the 'agentcoop vault credits' basket. */
export async function internalizeVaultCredits (wallet: WalletInterface, tx: Transaction, plan: SettlementPlan, myOutpoint: string, vaultId: string, originator?: string): Promise<VaultCredit> {
  const j = plan.participants.findIndex(p => p.outpoint === myOutpoint)
  if (j === -1) throw new AgentCoopError('BAD_PLAN', `${myOutpoint} is not in the plan`)
  if (plan.participants[j].creditLock !== 'vault') throw new AgentCoopError('BAD_PLAN', `${myOutpoint} did not ask for vault-locked credits`)
  return await insertVaultCredit(wallet, tx, 1 + j, vaultId, 'AgentCoop vault-locked credits', originator)
}

async function insertVaultCredit (wallet: WalletInterface, tx: Transaction, vout: number, vaultId: string, description: string, originator?: string): Promise<VaultCredit> {
  const out = tx.outputs[vout]
  const d = out === undefined ? null : decodeBsv21Owned(out.lockingScript)
  if (d === null || d.owner.kind !== 'vault' || d.op === 'burn' || d.id === undefined) throw new AgentCoopError('BAD_PLAN', `output ${vout} is not vault-locked credits`)
  const ins: VaultCreditInstructions = { vaultId, tokenId: d.id, amt: d.amt }
  await wallet.internalizeAction({
    tx: tx.toAtomicBEEF(),
    outputs: [{ outputIndex: vout, protocol: 'basket insertion', insertionRemittance: { basket: VAULT_CREDITS_BASKET, customInstructions: JSON.stringify(ins), tags: [vaultTag(vaultId), `id:${d.id}`, `amt:${d.amt}`] } }],
    labels: ['agentcoop', 'bsv21'],
    description
  }, originator)
  return { outpoint: coopOutpoint(tx.id('hex'), vout), tokenId: d.id, amt: d.amount, lockingScriptHex: out.lockingScript.toHex(), beef: tx.toAtomicBEEF() }
}

/** Vault-locked credits my wallet tracks for `vaultId` (optionally one token), largest first. */
export async function listVaultCredits (wallet: WalletInterface, vaultId: string, tokenId?: string, originator?: string): Promise<VaultCredit[]> {
  const res = await wallet.listOutputs({ basket: VAULT_CREDITS_BASKET, tags: [vaultTag(vaultId)], include: 'entire transactions', includeCustomInstructions: true, limit: 1000 }, originator)
  if (res.BEEF === undefined) return []
  const beef = Array.from(res.BEEF)
  const all = Beef.fromBinary(beef)
  return res.outputs
    .filter(o => o.spendable && o.customInstructions !== undefined)
    .map(o => {
      const ins = JSON.parse(o.customInstructions!) as VaultCreditInstructions
      const [txid, vout] = o.outpoint.split('.')
      const lockingScriptHex = all.findTxid(txid)?.tx?.outputs[Number(vout)]?.lockingScript.toHex() ?? ''
      return { outpoint: coopOutpoint(txid, Number(vout)), tokenId: ins.tokenId, amt: BigInt(ins.amt), lockingScriptHex, beef }
    })
    .filter(c => tokenId === undefined || c.tokenId === tokenId)
    .sort((a, b) => (a.amt === b.amt ? 0 : a.amt > b.amt ? -1 : 1))
}

/**
 * Move `amt` of a vault-locked credit UTXO to a P2PKH (redeem at the provider: pass
 * `context.creditPayees` so the guard can check the recipient). Agent + guard sign; a refusal
 * aborts the action and throws CosignRejected. Returns the AtomicBEEF to submit to tm_agentcoop
 * (parents first). `kind: 'list'` is refused by Track D's guard: use signVaultCreditListing.
 */
export async function transferVaultCredits (wallet: WalletInterface, args: {
  vaultId: string
  credit: VaultCredit
  amt: bigint
  toPkh: string
  kind: 'redeem' | 'list'
  cosign: Cosigner
  /** Extra context for the guard (e.g. poolId, tokenId is always set). */
  context?: Omit<CosignContext, 'kind'>
  originator?: string
}): Promise<{ txid: string, beef: number[], rest?: VaultCredit }> {
  const { credit, amt, originator } = args
  if (amt <= 0n || amt > credit.amt) throw new AgentCoopError('BAD_PLEDGE', `amt must be in 1..${credit.amt}`)
  const d = decodeBsv21Owned(credit.lockingScriptHex)
  if (d === null || d.owner.kind !== 'vault' || d.amount !== credit.amt) throw new AgentCoopError('BAD_PLEDGE', `${credit.outpoint} is not ${credit.amt} vault-locked credits`)
  const rest = credit.amt - amt
  const restScript = rest > 0n ? buildVaultCreditScript({ op: 'transfer', id: credit.tokenId, amt: rest.toString() }, d.owner.vaultScriptHex).toHex() : undefined
  const restIns: VaultCreditInstructions = { vaultId: args.vaultId, tokenId: credit.tokenId, amt: rest.toString() }
  const outputs = [
    { lockingScript: buildBsv21Script({ op: 'transfer', id: credit.tokenId, amt: amt.toString() }, args.toPkh).toHex(), satoshis: 1, outputDescription: `Credits (${args.kind})` },
    ...(restScript !== undefined
      ? [{ lockingScript: restScript, satoshis: 1, outputDescription: 'Credits back to the vault', basket: VAULT_CREDITS_BASKET, customInstructions: JSON.stringify(restIns), tags: [vaultTag(args.vaultId), `id:${credit.tokenId}`, `amt:${rest}`] }]
      : [])
  ]
  const created = await wallet.createAction({
    description: `AgentCoop: vault credits (${args.kind})`,
    labels: ['agentcoop', 'bsv21'],
    inputBEEF: credit.beef,
    inputs: [{ outpoint: toWalletOutpoint(credit.outpoint), unlockingScriptLength: VAULT_COSIGN_UNLOCK_LENGTH, inputDescription: 'AgentCoop vault-locked credits' }],
    outputs,
    options: { randomizeOutputs: false, acceptDelayedBroadcast: false, signAndProcess: false }
  }, originator)
  const signable = created.signableTransaction
  if (signable === undefined) throw new Error('createAction returned no signable transaction')
  let signed
  let signer: VaultSigner | undefined
  try {
    const tx = Transaction.fromAtomicBEEF(signable.tx)
    const [txid, vout] = credit.outpoint.split('_')
    const vi = tx.inputs.findIndex(i => (i.sourceTXID ?? i.sourceTransaction?.id('hex')) === txid && i.sourceOutputIndex === Number(vout))
    if (vi < 0) throw new Error('vault credit input missing from the signable transaction')
    outputs.forEach((o, i) => { if (tx.outputs[i]?.lockingScript.toHex() !== o.lockingScript) throw new Error(`output ${i} moved`) })
    signer = new VaultSigner(wallet, { vaultId: args.vaultId, cosign: args.cosign, context: { ...args.context, kind: args.kind, tokenId: credit.tokenId }, originator })
    const unlockingScript = await signer.sign(tx, vi)
    signed = await wallet.signAction({ reference: signable.reference, spends: { [vi]: { unlockingScript: unlockingScript.toHex() } } }, originator)
  } catch (e) {
    await wallet.abortAction({ reference: signable.reference }, originator).catch(() => {})
    throw e
  }
  const { txid, tx } = broadcastResult(signed)
  await reportCosigned(args.cosign, signer?.decisionIds ?? [], txid)
  return {
    txid,
    beef: tx,
    ...(restScript !== undefined ? { rest: { outpoint: coopOutpoint(txid, 1), tokenId: credit.tokenId, amt: rest, lockingScriptHex: restScript, beef: tx } } : {})
  }
}

/**
 * List a whole vault-locked credit UTXO on the market (D-P2b 'list'): input 0 = the credits,
 * output 0 = askSats back to the same vault script, signed SINGLE|ANYONECANPAY|FORKID by
 * agent + guard. The guard checks the owner's floor (minAskSatsPerCredit) and that the proceeds
 * go to the vault. The result is an ordinary market Listing (POST /listings, buildSweep);
 * cancelling = spending the UTXO (transferVaultCredits, or the owner alone).
 */
export async function signVaultCreditListing (wallet: WalletInterface, args: {
  vaultId: string
  credit: VaultCredit
  askSats: string
  cosign: Cosigner
  originator?: string
}): Promise<Listing> {
  const { credit, originator } = args
  if (!/^[1-9]\d*$/.test(args.askSats)) throw new AgentCoopError('BAD_LISTING', 'askSats must be a positive integer string')
  const d = decodeBsv21Owned(credit.lockingScriptHex)
  if (d === null || d.owner.kind !== 'vault' || d.op !== 'transfer' || d.amount !== credit.amt) throw new AgentCoopError('BAD_LISTING', `${credit.outpoint} is not ${credit.amt} vault-locked credits`)
  const { txid, vout } = parseOutpoint(credit.outpoint)
  const sourceTx = Transaction.fromBEEF(credit.beef, txid)
  if (sourceTx.outputs[vout]?.lockingScript.toHex() !== credit.lockingScriptHex) throw new AgentCoopError('BAD_LISTING', `${credit.outpoint}: locking script mismatch`)
  const payScriptHex = d.owner.vaultScriptHex
  const skeleton = offerSkeleton(sourceTx, vout, { payScriptHex, priceSats: args.askSats })
  skeleton.inputs[0].unlockingScript = new UnlockingScript([]) // serializable for the guard (txBEEF)
  const signer = new VaultSigner(wallet, { vaultId: args.vaultId, cosign: args.cosign, context: { kind: 'list', tokenId: credit.tokenId }, scope: VAULT_LIST_SIGHASH, originator })
  const unlock = await signer.sign(skeleton, 0)
  const { publicKey: seller } = await wallet.getPublicKey({ identityKey: true }, originator)
  return {
    outpoint: credit.outpoint, tokenId: credit.tokenId, credits: credit.amt.toString(), askSats: args.askSats, seller,
    unlockingScriptHex: unlock.toHex(), lockingScriptHex: credit.lockingScriptHex, payScriptHex
  }
}
