/**
 * Guard 'redeem' and 'list' (plan/phases/D-P2b.md): spending vault-locked credits
 * (A 5.1–5.3, `creditLock: 'vault'`). Credits locked to the vault script move only with
 * agent + guard (or the owner alone), so with these checks an agent cannot sell or send
 * its credits around the owner's policy (FINAL-IDEA §8, THREAT-MODEL T-10).
 *
 *   redeem (ALL)              credits go to an allowed provider's token address (proof:
 *                             receivePkh(provider, index)) or stay on this vault (change,
 *                             split); every credit accounted for (C1–C4)
 *   list (SINGLE|ACP, 0xC3)   the output at the input's index pays the vault script at least
 *                             credits × minAskSatsPerCredit; off unless the owner sets it (L1–L3)
 */
import { Utils, type Transaction } from '@agentcoop/core/sdk'
import { decodeBsv21Owned, receivePkh } from '@agentcoop/core'
import { VAULT_LIST_SIGHASH, VAULT_SIGHASH, vaultSighash, verifyVaultSignature } from '@agentcoop/core/scripts/vault'
import type { CreditPayeeProof } from '@agentcoop/core/signers/VaultSigner'
import { deny, inputOutpoint, inputSources, type CosignAllowed, type CosignDenied, type GuardPolicy, type RegisteredVault } from './policy'

export interface CreditsInput {
  kind: 'redeem' | 'list'
  tx: Transaction
  inputIndex: number
  agent: string
  agentSignatureHex: string
  creditPayees?: unknown
  findVault: (lockingScriptHex: string) => RegisteredVault | undefined
  policyFor: (owner: string, agent: string) => GuardPolicy | undefined
  spentInWindow: (owner: string, agent: string, exclude: string[]) => number
}

const IDENTITY_RE = /^0[23][0-9a-f]{64}$/
const isOpReturn = (hex: string): boolean => hex.startsWith('006a') || hex.startsWith('6a')
const short = (key: string): string => `${key.slice(0, 10)}…`

export function evaluateCredits (e: CreditsInput): CosignAllowed | CosignDenied {
  const { tx, inputIndex: i } = e
  if (!Number.isInteger(i) || i < 0 || i >= tx.inputs.length) return deny(400, `bad request: no input ${i}`)
  const sources = inputSources(tx) // G1
  if ('ok' in sources) return sources
  const { sats, scripts } = sources

  // C1: input i is vault-locked credits of a registered vault of this agent, the only input from that vault.
  const credit = decodeBsv21Owned(scripts[i])
  if (credit === null || credit.owner.kind !== 'vault' || credit.op === 'burn') return deny(403, 'not vault-locked credits')
  const vaultScript = credit.owner.vaultScriptHex
  const vault = e.findVault(vaultScript)
  if (vault === undefined) return deny(403, 'not a registered vault input')
  const vaultOutpoint = inputOutpoint(tx, i)
  const ctx = { vault, vaultOutpoint }
  if (vault.record.agent !== e.agent) return deny(403, 'agent mismatch', ctx)
  const fromThisVault = (hex: string): boolean => {
    if (hex === vaultScript) return true
    const d = decodeBsv21Owned(hex)
    return d?.owner.kind === 'vault' && d.owner.vaultScriptHex === vaultScript
  }
  if (scripts.filter(fromThisVault).length !== 1) return deny(403, 'more than one input from this vault', ctx)
  // Other inputs bring no credits: the agent's own sats for the fee only (keeps the conservation check exact).
  if (scripts.some((hex, k) => k !== i && decodeBsv21Owned(hex) !== null)) return deny(403, 'other credit inputs in the transaction', ctx)
  const src = tx.inputs[i]
  const tokenId = credit.op === 'deploy+mint' ? `${src.sourceTXID ?? src.sourceTransaction!.id('hex')}_${src.sourceOutputIndex}` : credit.id!

  // G4: final only.
  if (tx.lockTime !== 0 || tx.inputs.some(x => (x.sequence ?? 0xffffffff) !== 0xffffffff)) return deny(403, 'non-final transaction', ctx)

  // G5: the guard computes the sighash (ALL for redeem, SINGLE|ACP for a listing); the agent signed exactly it.
  const scope = e.kind === 'list' ? VAULT_LIST_SIGHASH : VAULT_SIGHASH
  const sighash = vaultSighash(tx, i, scope)
  const agentSig = /^([0-9a-f]{2})+$/i.test(e.agentSignatureHex ?? '') ? Utils.toArray(e.agentSignatureHex, 'hex') : []
  if (!verifyVaultSignature(vault.keys.agentPub, sighash, agentSig, scope)) return deny(403, 'agent signature invalid', ctx)

  // G6: default deny without a policy.
  const policy = e.policyFor(vault.record.owner, vault.record.agent)
  if (policy === undefined) return deny(403, 'no policy', ctx)

  const base = { ok: true as const, vault, sighash, vaultOutpoint, vaultInSats: sats[i], payees: [], hotSats: 0, signScope: scope }

  if (e.kind === 'list') {
    // L1: the proceeds (the output SINGLE pairs with this input) go to this vault, not to the agent.
    const out = tx.outputs[i]
    if (out === undefined) return deny(403, "listing needs the output at the input's index", ctx)
    if (out.lockingScript.toHex() !== vaultScript) return deny(403, 'listing proceeds must go to the vault', ctx)
    // L2: off unless the owner sets a floor; the ask covers it.
    const min = policy.minAskSatsPerCredit
    if (min === undefined || min <= 0) return deny(403, 'listing not enabled by the owner (minAskSatsPerCredit)', ctx)
    const ask = BigInt(out.satoshis ?? 0)
    const floor = credit.amount * BigInt(min)
    if (ask < floor) return deny(403, `ask below minAskSatsPerCredit (${ask} < ${floor})`, ctx)
    return { ...base, vaultReturnSats: Number(ask), outflowSats: 0, paidSats: 0, feeSats: 0, externalInSats: 0, unlistedOutSats: 0, windowSpentSats: 0, entries: [], credits: { tokenId, amount: credit.amount.toString(), askSats: Number(ask) } }
  }

  // C2: every credit output is either proven to an allowed provider or locked to this vault.
  const byVout = new Map<number, CreditPayeeProof>()
  const proofs = e.creditPayees ?? []
  if (!Array.isArray(proofs)) return deny(400, 'bad credit payee entry', ctx)
  for (const p of proofs as CreditPayeeProof[]) {
    if (p === null || typeof p !== 'object' || !Number.isInteger(p.vout) || tx.outputs[p.vout] === undefined || byVout.has(p.vout) ||
      typeof p.provider !== 'string' || !IDENTITY_RE.test(p.provider) || !Number.isInteger(p.index) || p.index < 0) {
      return deny(400, 'bad credit payee entry', ctx)
    }
    byVout.set(p.vout, p)
  }
  let delivered = 0n
  let kept = 0n
  let vaultReturn = 0
  let paid = 0
  let unlisted = 0
  for (const [vout, out] of tx.outputs.entries()) {
    const hex = out.lockingScript.toHex()
    const s = out.satoshis ?? 0
    const d = decodeBsv21Owned(hex)
    const proof = byVout.get(vout)
    if (d !== null) {
      if (d.op !== 'transfer' || d.id !== tokenId) return deny(403, `credits to unlisted output (vout ${vout})`, ctx)
      if (d.owner.kind === 'vault') {
        if (d.owner.vaultScriptHex !== vaultScript) return deny(403, `credits to another vault (vout ${vout})`, ctx)
        kept += d.amount
        vaultReturn += s
      } else {
        if (proof === undefined) return deny(403, `credits to unlisted output (vout ${vout})`, ctx)
        if (!policy.allowProviders.includes(proof.provider)) return deny(403, `provider not allowed: ${short(proof.provider)}`, ctx)
        if (receivePkh(proof.provider, proof.index) !== d.owner.pkh) return deny(403, `payee proof mismatch at vout ${vout}`, ctx)
        delivered += d.amount
        paid += s
      }
    } else if (proof !== undefined) {
      return deny(400, `credit payee entry for a non-credit output (vout ${vout})`, ctx)
    } else if (hex === vaultScript) {
      vaultReturn += s
    } else if (isOpReturn(hex)) {
      if (s > 0) return deny(403, 'OP_RETURN output carries sats', ctx)
    } else {
      unlisted += s
    }
  }
  // C3: conservation, same token, nothing burned.
  if (delivered + kept !== credit.amount) return deny(403, `credits not conserved (${delivered + kept} out of ${credit.amount})`, ctx)

  // C4 = G9, G10, G12 on the sats.
  const vaultIn = sats[i]
  const externalIn = sats.reduce((a, b) => a + b, 0) - vaultIn
  if (unlisted > externalIn) return deny(403, 'vault funds to unlisted output', ctx)
  const fee = vaultIn + externalIn - tx.outputs.reduce((a, o) => a + (o.satoshis ?? 0), 0)
  if (fee < 0) return deny(400, 'outputs exceed inputs', ctx)
  if (fee > policy.maxFeeSats) return deny(403, `maxFeeSats exceeded (${fee} > ${policy.maxFeeSats})`, ctx)
  const outflow = Math.max(0, vaultIn - vaultReturn)
  const windowSpent = e.spentInWindow(vault.record.owner, vault.record.agent, [vaultOutpoint])
  if (windowSpent + outflow > policy.weeklyCapSats) return deny(403, `weeklyCapSats exceeded (${windowSpent} + ${outflow} > ${policy.weeklyCapSats})`, ctx)

  return {
    ...base,
    vaultReturnSats: vaultReturn,
    outflowSats: outflow,
    paidSats: paid,
    feeSats: fee,
    externalInSats: externalIn,
    unlistedOutSats: unlisted,
    windowSpentSats: windowSpent,
    entries: [{ outpoint: vaultOutpoint, outflowSats: outflow, kind: 'pay' }],
    credits: { tokenId, amount: credit.amount.toString(), delivered: delivered.toString(), kept: kept.toString() }
  }
}
