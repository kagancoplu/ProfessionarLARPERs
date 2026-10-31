/**
 * Guard 'rail' path (plan/phases/D-P3.md §4.5, §7 R1–R6): co-sign the claim of a
 * Coop Rail HTLC (USDC on Base → BSV) only if the BSV lands in the agent's vault.
 * The claim branch is agent + guard 2-of-2, so Rail money cannot bypass the vault
 * policy (threat T-14 in docs/THREAT-MODEL.md: "a Coop Rail claim bypasses the vault policy"). The script
 * itself checks the secret; the guard never needs it.
 */
import type { Transaction } from '@agentcoop/core/sdk'
import { RAIL_PROTOCOL, deriveRailPub, parseHtlcLockingScript } from '@agentcoop/core/scripts/htlc'
import { vaultSighash, verifyVaultSignature } from '@agentcoop/core/scripts/vault'
import { Utils } from '@agentcoop/core/sdk'
import { deny, inputOutpoint, inputSources, type CosignAllowed, type CosignDenied, type GuardPolicy, type RegisteredVault } from './policy'

export interface RailInput {
  tx: Transaction
  inputIndex: number
  agent: string
  agentSignatureHex: string
  swapId: unknown
  guardIdentity: string
  vaultsOfAgent: (agent: string) => RegisteredVault[]
  policyFor: (owner: string, agent: string) => GuardPolicy | undefined
}

const isOpReturn = (hex: string): boolean => hex.startsWith('006a') || hex.startsWith('6a')

export function evaluateRail (e: RailInput): CosignAllowed | CosignDenied {
  const { tx, inputIndex: i } = e
  if (!Number.isInteger(i) || i < 0 || i >= tx.inputs.length) return deny(400, `bad request: no input ${i}`)
  if (typeof e.swapId !== 'string' || !/^[0-9a-f]{32}$/.test(e.swapId)) return deny(400, 'bad request: context.swapId (32 hex) required for rail')
  const swapId = e.swapId
  const sources = inputSources(tx) // R1 = G1
  if ('ok' in sources) return sources

  // R2: an HTLC naming this guard's and this agent's keys for this swap, once in the tx.
  const htlcScript = sources.scripts[i]
  const keys = parseHtlcLockingScript(htlcScript)
  if (keys === null || keys.guardPub !== deriveRailPub(e.guardIdentity, swapId)) return deny(403, 'not a rail HTLC for this guard')
  if (keys.agentPub !== deriveRailPub(e.agent, swapId)) return deny(403, 'agent mismatch')
  if (sources.scripts.filter(s => s === htlcScript).length !== 1) return deny(403, 'more than one input from this HTLC')
  const htlcOutpoint = inputOutpoint(tx, i)

  // R3: final, and the agent signed the sighash the guard computes.
  if (tx.lockTime !== 0 || tx.inputs.some(x => (x.sequence ?? 0xffffffff) !== 0xffffffff)) return deny(403, 'non-final transaction')
  const sighash = vaultSighash(tx, i)
  const sig = /^([0-9a-f]{2})+$/i.test(e.agentSignatureHex ?? '') ? Utils.toArray(e.agentSignatureHex, 'hex') : []
  if (!verifyVaultSignature(keys.agentPub, sighash, sig)) return deny(403, 'agent signature invalid')

  // R4: the agent has a registered vault with a policy.
  const vaults = e.vaultsOfAgent(e.agent)
  if (vaults.length === 0) return deny(403, 'no vault for this agent')
  const byScript = new Map(vaults.map(v => [v.lockingScriptHex, v]))

  // R5: the HTLC's money lands in the agent's vault (only the miner fee may come out of it).
  let toVault = 0
  let unlisted = 0
  let target: RegisteredVault | undefined
  for (const out of tx.outputs) {
    const hex = out.lockingScript.toHex()
    const sats = out.satoshis ?? 0
    const v = byScript.get(hex)
    if (v !== undefined) { toVault += sats; target ??= v } else if (isOpReturn(hex)) {
      if (sats > 0) return deny(403, 'OP_RETURN output carries sats')
    } else unlisted += sats
  }
  if (target === undefined) return deny(403, 'rail funds must land in the vault')
  const ctx = { vault: target, vaultOutpoint: htlcOutpoint }
  const policy = e.policyFor(target.record.owner, e.agent)
  if (policy === undefined) return deny(403, 'no policy', ctx)
  const htlcIn = sources.sats[i]
  const externalIn = sources.sats.reduce((s, v) => s + v, 0) - htlcIn
  const fee = htlcIn + externalIn - tx.outputs.reduce((s, o) => s + (o.satoshis ?? 0), 0)
  if (fee < 0) return deny(400, 'outputs exceed inputs', ctx)
  if (unlisted > externalIn) return deny(403, 'vault funds to unlisted output', ctx)
  if (htlcIn - toVault > Math.max(fee, 0)) return deny(403, 'rail funds must land in the vault', ctx)
  // R6
  if (fee > policy.maxFeeSats) return deny(403, `maxFeeSats exceeded (${fee} > ${policy.maxFeeSats})`, ctx)

  return {
    ok: true,
    vault: target,
    sighash,
    vaultOutpoint: htlcOutpoint,
    vaultInSats: 0,
    vaultReturnSats: toVault,
    outflowSats: 0,
    paidSats: 0,
    feeSats: fee,
    externalInSats: externalIn,
    unlistedOutSats: unlisted,
    windowSpentSats: 0,
    payees: [],
    hotSats: 0,
    inflowSats: toVault,
    signWith: { protocolID: RAIL_PROTOCOL, keyID: swapId, pub: keys.guardPub },
    entries: [] // an inflow: nothing counts against the caps
  }
}
