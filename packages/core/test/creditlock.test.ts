/**
 * Track A 5.1–5.2: vault-locked BSV-21 credits. Encoding round-trip, the kit's
 * P2PKH decoding unchanged, the rules' ownerKinds flag (default = kit), and the
 * point of it all: script alone stops the agent from moving the credits.
 */
import { describe, expect, it } from 'vitest'
import { BigNumber, ECDSA, LockingScript, PrivateKey, Transaction, UnlockingScript } from '../src/sdk'
import { buildBsv21Script, decodeBsv21 } from '../src/kit/inscription'
import { identifyAdmissible, UnknownTokenInputError } from '../src/kit/rules'
import { buildVaultCreditScript, decodeBsv21Owned, vaultKeysOfScript, vaultScriptHash } from '../src/scripts/creditLock'
import { toChecksigSignature, vaultCosignUnlock, vaultLockingScript, vaultOwnerUnlock, vaultSighash } from '../src/scripts/vault'
import { inputScriptValid } from '../src/util/spend'

const owner = PrivateKey.fromRandom()
const agent = PrivateKey.fromRandom()
const guard = PrivateKey.fromRandom()
const pub = (k: PrivateKey): string => k.toPublicKey().toString()
const vault = vaultLockingScript(pub(owner), pub(agent), pub(guard))
const A = 'ab'.repeat(20)
const ID = `${'aa'.repeat(32)}_0`
const EMPTY = new UnlockingScript([])

function deployTx (amt = '1000'): { tx: Transaction, tokenId: string } {
  const tx = new Transaction()
  tx.addOutput({ lockingScript: buildBsv21Script({ op: 'deploy+mint', amt, sym: 'VLT', dec: '0' }, A), satoshis: 1 })
  return { tx, tokenId: `${tx.id('hex')}_0` }
}

function spend (parent: Transaction, vout: number, outputs: LockingScript[]): Transaction {
  const tx = new Transaction()
  tx.addInput({ sourceTransaction: parent, sourceOutputIndex: vout, unlockingScript: EMPTY })
  for (const lockingScript of outputs) tx.addOutput({ lockingScript, satoshis: 1 })
  return tx
}

const vaultOut = (id: string, amt: string): LockingScript => buildVaultCreditScript({ op: 'transfer', id, amt }, vault)
const p2pkhOut = (id: string, amt: string): LockingScript => buildBsv21Script({ op: 'transfer', id, amt }, A)
const VAULT = { ownerKinds: ['p2pkh', 'vault'] as const }

describe('vault-locked credit script (5.1)', () => {
  it('round-trips: same envelope, vault script as the owner', () => {
    const s = vaultOut(ID, '250')
    expect(s.toHex().endsWith(vault.toHex())).toBe(true)
    expect(s.toHex().slice(0, -vault.toHex().length)).toBe(p2pkhOut(ID, '250').toHex().slice(0, -50)) // identical envelope
    expect(decodeBsv21Owned(s)).toEqual({
      op: 'transfer', id: ID, amt: '250', sym: undefined, dec: undefined, icon: undefined, amount: 250n,
      owner: { kind: 'vault', vaultScriptHex: vault.toHex(), vaultHash: vaultScriptHash(vault.toHex()) }
    })
    expect(vaultKeysOfScript(s)).toEqual({ ownerPub: pub(owner), agentPub: pub(agent), guardPub: pub(guard) })
    expect(decodeBsv21(s)).toBeNull() // the kit (and a P2PKH-only overlay) does not see it as a token
  })

  it('P2PKH outputs decode exactly as the kit decodes them (regression)', () => {
    const s = p2pkhOut(ID, '42')
    const kit = decodeBsv21(s)!
    const { ownerPkh, ...rest } = kit
    expect(decodeBsv21Owned(s)).toEqual({ ...rest, owner: { kind: 'p2pkh', pkh: ownerPkh } })
  })

  it('refuses a non-vault suffix and a non-vault script to build on', () => {
    const notVault = LockingScript.fromHex(p2pkhOut(ID, '1').toHex().slice(0, -50) + '51') // envelope + OP_TRUE
    expect(decodeBsv21Owned(notVault)).toBeNull()
    expect(() => buildVaultCreditScript({ op: 'transfer', id: ID, amt: '1' }, LockingScript.fromHex('51'))).toThrow(/not a Mandate Vault/)
  })

  it('refuses a non-canonical content-type tag (a data push of 0x01 instead of OP_1), as the kit does', () => {
    const s = vaultOut(ID, '5')
    const chunks = s.chunks.map((c, i) => i === 3 ? { op: 1, data: [1] } : c)
    const pushed = new LockingScript(chunks)
    expect(pushed.toHex()).not.toBe(s.toHex())
    expect(decodeBsv21Owned(pushed)).toBeNull()
  })
})

describe('rules with ownerKinds (5.2)', () => {
  it('default (kit): a vault-locked output is not a token; the P2PKH outputs beside it are admitted', () => {
    const { tx: d, tokenId } = deployTx()
    const t = spend(d, 0, [p2pkhOut(tokenId, '600'), vaultOut(tokenId, '400')])
    expect(identifyAdmissible(t, [0])).toEqual({ outputsToAdmit: [0], coinsToRetain: [0] })
  })

  it('flag on: a settlement-like split into P2PKH + vault-locked credits is admitted', () => {
    const { tx: d, tokenId } = deployTx()
    const t = spend(d, 0, [p2pkhOut(tokenId, '600'), vaultOut(tokenId, '400')])
    expect(identifyAdmissible(t, [0], VAULT)).toEqual({ outputsToAdmit: [0, 1], coinsToRetain: [0] })
  })

  it('flag on: vault-locked credits can move back to a P2PKH (redeem / list), conservation still holds', () => {
    const { tx: d, tokenId } = deployTx('400')
    const locked = spend(d, 0, [vaultOut(tokenId, '400')])
    expect(identifyAdmissible(spend(locked, 0, [p2pkhOut(tokenId, '400')]), [0], VAULT).outputsToAdmit).toEqual([0])
    expect(identifyAdmissible(spend(locked, 0, [p2pkhOut(tokenId, '401')]), [0], VAULT).outputsToAdmit).toEqual([]) // inflation
    // Default rules do not count the vault input: nothing covers the P2PKH output.
    expect(identifyAdmissible(spend(locked, 0, [p2pkhOut(tokenId, '400')]), [0]).outputsToAdmit).toEqual([])
  })

  it('flag on: a vault-locked input the overlay never admitted refuses the transaction', () => {
    const { tx: d, tokenId } = deployTx('400')
    const locked = spend(d, 0, [vaultOut(tokenId, '400')])
    expect(() => identifyAdmissible(spend(locked, 0, [p2pkhOut(tokenId, '400')]), [], VAULT)).toThrow(UnknownTokenInputError)
  })
})

describe('ownership is enforced by script', () => {
  const { tx: d, tokenId } = deployTx('400')
  const locked = spend(d, 0, [vaultOut(tokenId, '400')])
  const sign = (tx: Transaction, k: PrivateKey): number[] => toChecksigSignature(ECDSA.sign(new BigNumber(vaultSighash(tx, 0)), k, true).toDER() as number[])
  const attempt = (unlock: (tx: Transaction) => UnlockingScript): boolean => {
    const tx = spend(locked, 0, [p2pkhOut(tokenId, '400')])
    tx.inputs[0].unlockingScript = unlock(tx)
    return inputScriptValid(tx, 0)
  }

  it('the agent alone cannot move them (both 2-of-2 slots with its own key)', () => {
    expect(attempt(tx => vaultCosignUnlock(sign(tx, agent), sign(tx, agent)))).toBe(false)
    expect(attempt(tx => vaultOwnerUnlock(sign(tx, agent)))).toBe(false)
  })

  it('agent + guard, or the owner alone, can', () => {
    expect(attempt(tx => vaultCosignUnlock(sign(tx, agent), sign(tx, guard)))).toBe(true)
    expect(attempt(tx => vaultOwnerUnlock(sign(tx, owner)))).toBe(true)
  })
})
