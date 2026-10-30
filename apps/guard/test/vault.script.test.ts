/**
 * D-P1 §9.1: vault script, keys, record, and the pure policy engine on
 * hand-built transactions (no chain needed).
 */
import { describe, expect, it } from 'vitest'
import { BigNumber, ECDSA, KeyDeriver, LockingScript, P2PKH, PrivateKey, Script, Transaction, TransactionSignature, Utils } from '@agentcoop/core/sdk'
import { VAULT_PROTOCOL } from '@agentcoop/core'
import {
  VAULT_COSIGN_UNLOCK_LENGTH,
  VAULT_OWNER_UNLOCK_LENGTH,
  VAULT_SCRIPT_LENGTH,
  VAULT_SIGHASH,
  deriveVaultPub,
  isVaultLockingScriptHex,
  newVaultId,
  parseVaultLockingScript,
  providerPayScript,
  validateVaultRecord,
  vaultCosignUnlock,
  vaultKeysForRecord,
  vaultLockingScript,
  vaultOwnerUnlock,
  vaultRecordScript,
  vaultScriptForRecord,
  vaultSighash,
  verifyVaultSignature,
  type VaultRecord
} from '@agentcoop/core/scripts/vault'
import { parseOpReturn } from '@agentcoop/core'
import { evaluateCosign, type GuardPolicy, type RegisteredVault } from '../src/policy'

const owner = PrivateKey.fromRandom()
const agent = PrivateKey.fromRandom()
const guard = PrivateKey.fromRandom()
const provider = PrivateKey.fromRandom()
const id = (k: PrivateKey): string => k.toPublicKey().toString()
const vaultId = newVaultId()
const record: VaultRecord = { v: '1', vaultId, owner: id(owner), agent: id(agent), guard: id(guard) }

describe('vault script and keys', () => {
  it('is the 109-byte OP_IF / 2-of-2 template and parses back', () => {
    const k = vaultKeysForRecord(record)
    const s = vaultLockingScript(k.ownerPub, k.agentPub, k.guardPub)
    expect(s.toBinary().length).toBe(VAULT_SCRIPT_LENGTH)
    expect(s.toHex()).toBe(`6321${k.ownerPub}ac675221${k.agentPub}21${k.guardPub}52ae68`)
    expect(s.toASM()).toBe(`OP_IF ${k.ownerPub} OP_CHECKSIG OP_ELSE OP_2 ${k.agentPub} ${k.guardPub} OP_2 OP_CHECKMULTISIG OP_ENDIF`)
    expect(parseVaultLockingScript(s)).toEqual(k)
    expect(isVaultLockingScriptHex(s.toHex())).toBe(true)
    expect(parseVaultLockingScript(new P2PKH().lock(owner.toPublicKey().toAddress()))).toBeNull()
    expect(parseVaultLockingScript(s.toHex().slice(0, -2))).toBeNull()
    expect(vaultScriptForRecord(record).toHex()).toBe(s.toHex())
  })

  it('locks to derived keys that only the party can sign for, never to an identity key', () => {
    const k = vaultKeysForRecord(record)
    for (const [root, pub] of [[owner, k.ownerPub], [agent, k.agentPub], [guard, k.guardPub]] as const) {
      expect(pub).not.toBe(id(root))
      // what the party's own wallet derives: getPublicKey({ protocolID, keyID: vaultId, counterparty: 'anyone', forSelf: true })
      expect(new KeyDeriver(root).derivePublicKey(VAULT_PROTOCOL, vaultId, 'anyone', true).toString()).toBe(pub)
      expect(deriveVaultPub(id(root), vaultId)).toBe(pub)
    }
  })

  it('validates records: string values, vaultId format, three distinct parties', () => {
    expect(validateVaultRecord(record)).toEqual(record)
    expect(validateVaultRecord({ ...record, v: 1 })).toBeNull()
    expect(validateVaultRecord({ ...record, vaultId: 'abc' })).toBeNull()
    expect(validateVaultRecord({ ...record, guard: record.agent })).toBeNull() // 2-of-2 would collapse to one key
    expect(validateVaultRecord({ ...record, owner: record.owner.slice(2) })).toBeNull()
  })

  it('writes the OP_RETURN record in the MASTER §3.2 envelope (same bytes Track B parses)', () => {
    const parsed = parseOpReturn(vaultRecordScript(record))
    expect(parsed).toEqual({ op: 'vault', json: record })
    expect(validateVaultRecord(parsed!.json)).toEqual(record)
  })

  it('unlocking scripts stay within the exported lengths even with the longest signatures', () => {
    const longSig = [...new Array(72).fill(0x30), VAULT_SIGHASH] // DER ≤ 72 + sighash byte
    expect(vaultOwnerUnlock(longSig).toBinary().length).toBeLessThanOrEqual(VAULT_OWNER_UNLOCK_LENGTH)
    expect(vaultCosignUnlock(longSig, longSig).toBinary().length).toBeLessThanOrEqual(VAULT_COSIGN_UNLOCK_LENGTH)
    const asm = vaultCosignUnlock(longSig, longSig).toASM().split(' ')
    expect([asm[0], asm[3], asm.length]).toEqual(['OP_0', 'OP_0', 4]) // multisig dummy, sigA, sigG, OP_ELSE selector
    expect(vaultOwnerUnlock(longSig).toASM().split(' ')[1]).toBe('OP_1')
  })
})

// ── policy engine on hand-built transactions ─────────────────────────────────

const keys = vaultKeysForRecord(record)
const vaultScript = vaultScriptForRecord(record)
const registered: RegisteredVault = { record, keys, lockingScriptHex: vaultScript.toHex(), registeredAt: new Date().toISOString() }
const policy: GuardPolicy = { allowProviders: [id(provider)], maxPerPoolSats: 3000, weeklyCapSats: 5000, maxFeeSats: 500, hotWalletDailySats: 0 }
const agentVaultKey = new KeyDeriver(agent).derivePrivateKey(VAULT_PROTOCOL, vaultId, 'anyone')
const payScript = providerPayScript(id(provider), 'pool-1')
const changeScript = new P2PKH().lock(PrivateKey.fromRandom().toPublicKey().toAddress())

function sourceTx (lockingScript: LockingScript, satoshis: number): Transaction {
  const t = new Transaction()
  t.addInput({ sourceTXID: '11'.repeat(32), sourceOutputIndex: 0, unlockingScript: new Script(), sequence: 0xffffffff })
  t.addOutput({ lockingScript, satoshis })
  return t
}

/** vault 10,000 + agent's own 5,000 → 1,000 to the provider, 9,000 back to the vault, 4,900 agent change (fee 100). */
function payTx (opts: { pay?: number, change?: number, lockTime?: number, extraOutputs?: Array<{ lockingScript: LockingScript, satoshis: number }> } = {}): Transaction {
  const tx = new Transaction()
  tx.addInput({ sourceTransaction: sourceTx(vaultScript, 10_000), sourceOutputIndex: 0, unlockingScript: new Script(), sequence: 0xffffffff })
  tx.addInput({ sourceTransaction: sourceTx(changeScript, 5_000), sourceOutputIndex: 0, unlockingScript: new Script(), sequence: 0xffffffff })
  tx.addOutput({ lockingScript: payScript, satoshis: opts.pay ?? 1_000 })
  tx.addOutput({ lockingScript: vaultScript, satoshis: 10_000 - (opts.pay ?? 1_000) })
  tx.addOutput({ lockingScript: changeScript, satoshis: opts.change ?? 4_900 })
  for (const o of opts.extraOutputs ?? []) tx.addOutput(o)
  tx.lockTime = opts.lockTime ?? 0
  return tx
}

function agentSig (tx: Transaction, i = 0): string {
  const sig = ECDSA.sign(new BigNumber(vaultSighash(tx, i)), agentVaultKey, true)
  return Utils.toHex(new TransactionSignature(sig.r, sig.s, VAULT_SIGHASH).toChecksigFormat())
}

function evaluate (tx: Transaction, over: Partial<Parameters<typeof evaluateCosign>[0]> = {}): ReturnType<typeof evaluateCosign> {
  return evaluateCosign({
    tx,
    inputIndex: 0,
    agent: id(agent),
    agentSignatureHex: agentSig(tx),
    context: { kind: 'pay', payees: [{ vout: 0, provider: id(provider), keyID: 'pool-1' }] },
    findVault: s => s === registered.lockingScriptHex ? registered : undefined,
    policyFor: () => policy,
    spentInWindow: () => 0,
    ...over
  })
}

const reasonOf = (r: ReturnType<typeof evaluateCosign>): string => r.ok ? 'ok' : r.reason

describe('policy engine (evaluateCosign)', () => {
  it('allows a policy-conforming payment and reports the vault outflow', () => {
    const r = evaluate(payTx())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r).toMatchObject({ vaultInSats: 10_000, vaultReturnSats: 9_000, outflowSats: 1_000, paidSats: 1_000, feeSats: 100, externalInSats: 5_000, unlistedOutSats: 4_900 })
    expect(verifyVaultSignature(keys.agentPub, r.sighash, Utils.toArray(agentSig(payTx()), 'hex'))).toBe(true)
  })

  it('G1: refuses a source transaction that does not hash to the prevout (amount lie)', () => {
    const tx = payTx()
    tx.inputs[1].sourceTXID = '22'.repeat(32)
    expect(reasonOf(evaluate(tx))).toBe('source txid mismatch for input 1')
  })

  it('G2: settle and rail are not enabled in D-P1', () => {
    expect(reasonOf(evaluate(payTx(), { context: { kind: 'settle' } }))).toBe("kind 'settle' not enabled")
  })

  it('G3: unknown vault, another agent, two inputs from the same vault', () => {
    expect(reasonOf(evaluate(payTx(), { findVault: () => undefined }))).toBe('not a registered vault input')
    expect(reasonOf(evaluate(payTx(), { agent: id(guard) }))).toBe('agent mismatch')
    const tx = payTx()
    tx.addInput({ sourceTransaction: sourceTx(vaultScript, 1), sourceOutputIndex: 0, unlockingScript: new Script(), sequence: 0xffffffff })
    expect(reasonOf(evaluate(tx))).toBe('more than one input from this vault')
  })

  it('G4: a time-locked (non-final) transaction is refused', () => {
    expect(reasonOf(evaluate(payTx({ lockTime: 900_000 })))).toBe('non-final transaction')
  })

  it('G5: the agent must have signed the sighash the guard computes', () => {
    const other = payTx({ pay: 1_001, change: 4_899 })
    expect(reasonOf(evaluate(payTx(), { agentSignatureHex: agentSig(other) }))).toBe('agent signature invalid')
    expect(reasonOf(evaluate(payTx(), { agentSignatureHex: 'zz' }))).toBe('agent signature invalid')
  })

  it('G6: no policy, no signature', () => {
    expect(reasonOf(evaluate(payTx(), { policyFor: () => undefined }))).toBe('no policy')
  })

  it('G7/G8: OP_RETURN with sats, payee not allowed, payee proof that does not match', () => {
    const burn = LockingScript.fromHex('006a0474657374')
    expect(reasonOf(evaluate(payTx({ change: 4_899, extraOutputs: [{ lockingScript: burn, satoshis: 1 }] })))).toBe('OP_RETURN output carries sats')
    expect(reasonOf(evaluate(payTx(), { policyFor: () => ({ ...policy, allowProviders: [] }) }))).toMatch(/^provider not allowed/)
    expect(reasonOf(evaluate(payTx(), { context: { kind: 'pay', payees: [{ vout: 0, provider: id(provider), keyID: 'pool-2' }] } }))).toBe('payee proof mismatch at vout 0')
    expect(reasonOf(evaluate(payTx(), { context: { kind: 'pay', payees: [{ vout: 7, provider: id(provider), keyID: 'pool-1' }] } }))).toBe('bad payee entry')
  })

  it('G9: vault money cannot go to an output without a proof', () => {
    expect(reasonOf(evaluate(payTx(), { context: { kind: 'pay', payees: [] } }))).toBe('vault funds to unlisted output')
  })

  it('G10–G12: fee, per-payment and weekly caps', () => {
    expect(reasonOf(evaluate(payTx({ change: 4_000 })))).toBe('maxFeeSats exceeded (1000 > 500)')
    expect(reasonOf(evaluate(payTx({ pay: 3_500 })))).toBe('maxPerPoolSats exceeded (3500 > 3000)')
    expect(reasonOf(evaluate(payTx(), { spentInWindow: () => 4_500 }))).toBe('weeklyCapSats exceeded (4500 + 1000 > 5000)')
  })
})
