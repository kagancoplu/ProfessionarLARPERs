/**
 * Lighthouse pledge coin script (track A 5.5). The Mandate Vault template with
 * the human in the owner and agent slots, under two DIFFERENT keys:
 *
 *   OP_IF <humanWithdrawPub> OP_CHECKSIG OP_ELSE OP_2 <humanPub> <guardPub> OP_2 OP_CHECKMULTISIG OP_ENDIF
 *
 *   human alone (withdraw, any time):  <sigHuman ALL> OP_1
 *   settlement:                        OP_0 <sigHuman SINGLE|ACP> <sigGuard ALL> OP_0
 *
 * The human signs once, offline, SINGLE|ANYONECANPAY: "spend this coin if the
 * output at my index gives me k credits". That alone would let anyone take the
 * coin with a fake credit output (BSV-21 is not enforced by script), so the
 * guard the human chose co-signs ALL only after checking the whole settlement
 * and the credits' lineage. Keys: VAULT_PROTOCOL, 'anyone'; keyID = lhId for the
 * human's settlement key and the guard, `withdraw <lhId>` for the human's solo key.
 * The two human keys must differ: OP_CHECKSIG accepts any sighash type, so with one
 * key the SINGLE|ACP pre-signature would also open the solo branch and anyone
 * holding it could take the coin.
 */
import { Hash, TransactionSignature, type LockingScript, type Transaction } from '../sdk'
import type { PledgeRecord } from '../types'
import { deriveVaultPub, vaultLockingScript } from './vault'

export type LighthouseRecord = PledgeRecord & { mode: 'lighthouse', guard: string, lhId: string }

export const isLighthouseRecord = (r: Partial<PledgeRecord> | undefined): r is LighthouseRecord =>
  r?.mode === 'lighthouse' && r.signer === 'vault' && typeof r.guard === 'string' && typeof r.lhId === 'string' && typeof r.participant === 'string'

/** keyID of the human's solo (withdraw) key; the settlement key is lhId itself. */
export const lighthouseWithdrawKeyID = (lhId: string): string => `withdraw ${lhId}`

export function lighthouseLockingScript (r: Pick<LighthouseRecord, 'participant' | 'guard' | 'lhId'>): LockingScript {
  return vaultLockingScript(
    deriveVaultPub(r.participant, lighthouseWithdrawKeyID(r.lhId)),
    deriveVaultPub(r.participant, r.lhId),
    deriveVaultPub(r.guard, r.lhId)
  )
}

/** BIP-143 sighash of input `i` under `scope`; the subscript is the whole locking script. */
export function scriptSighash (tx: Transaction, inputIndex: number, scope: number): number[] {
  const input = tx.inputs[inputIndex]
  const sourceTx = input?.sourceTransaction
  const source = sourceTx?.outputs[input.sourceOutputIndex]
  if (sourceTx === undefined || source?.satoshis === undefined) throw new Error(`input ${inputIndex}: source output missing`)
  return Hash.hash256(TransactionSignature.format({
    sourceTXID: input.sourceTXID ?? sourceTx.id('hex'),
    sourceOutputIndex: input.sourceOutputIndex,
    sourceSatoshis: source.satoshis,
    transactionVersion: tx.version,
    otherInputs: tx.inputs.filter((_, i) => i !== inputIndex),
    inputIndex,
    outputs: tx.outputs,
    inputSequence: input.sequence ?? 0xffffffff,
    subscript: source.lockingScript,
    lockTime: tx.lockTime,
    scope
  }))
}
