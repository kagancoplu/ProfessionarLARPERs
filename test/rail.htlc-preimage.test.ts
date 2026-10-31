/**
 * F-11 (AUDIT-READINESS): the Coop Rail's BSV HTLC claim branch takes only a 32-byte secret.
 * The Base HTLC accepts only bytes32; with no size check an agent could pick a longer secret,
 * claim the BSV and leave the maker unable to claim the USDC. Script level, no chain.
 */
import { describe, expect, it } from 'vitest'
import { BigNumber, ECDSA, Hash, LockingScript, P2PKH, PrivateKey, Random, Transaction } from '@agentcoop/core/sdk'
import { htlcClaimUnlock, htlcLockingScript, inputScriptValid, parseHtlcLockingScript, sha256Hex, toChecksigSignature, vaultSighash } from '@agentcoop/core'

const [agent, guard, maker] = [PrivateKey.fromRandom(), PrivateKey.fromRandom(), PrivateKey.fromRandom()]

function claimWith (secret: number[], lockedTo: number[] = secret): boolean {
  const script: LockingScript = htlcLockingScript(sha256Hex(lockedTo), agent.toPublicKey().toString(), guard.toPublicKey().toString(), maker.toPublicKey().toString())
  const funding = new Transaction()
  funding.addOutput({ lockingScript: script, satoshis: 10_000 })
  const tx = new Transaction()
  tx.addInput({ sourceTransaction: funding, sourceOutputIndex: 0, sequence: 0xffffffff })
  tx.addOutput({ lockingScript: new P2PKH().lock(agent.toAddress()), satoshis: 9_900 })
  const h = vaultSighash(tx, 0)
  const sig = (k: PrivateKey): number[] => toChecksigSignature(ECDSA.sign(new BigNumber(h), k, true).toDER() as number[]) // the sighash itself, not re-hashed
  tx.inputs[0].unlockingScript = htlcClaimUnlock(sig(agent), sig(guard), secret)
  return inputScriptValid(tx, 0)
}

describe('Coop Rail HTLC claim: 32-byte secret only (F-11)', () => {
  it('claims with a 32-byte secret', () => {
    expect(claimWith(Random(32))).toBe(true)
  })

  it('refuses a longer or shorter secret even when its hash matches', () => {
    expect(claimWith(Random(33))).toBe(false)
    expect(claimWith(Random(31))).toBe(false)
  })

  it('refuses a wrong 32-byte secret', () => {
    expect(claimWith(Random(32), Random(32))).toBe(false)
  })

  it('the script still parses back to its keys', () => {
    const secret = Random(32)
    const script = htlcLockingScript(Hash.sha256(secret).map(b => b.toString(16).padStart(2, '0')).join(''), agent.toPublicKey().toString(), guard.toPublicKey().toString(), maker.toPublicKey().toString())
    expect(parseHtlcLockingScript(script)).toMatchObject({ hash: sha256Hex(secret), agentPub: agent.toPublicKey().toString() })
  })
})
