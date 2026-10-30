/** Local script check of one input with the SDK interpreter (no network). */
import { Spend, type Transaction, type UnlockingScript } from '../sdk'

export function inputScriptValid (tx: Transaction, inputIndex: number): boolean {
  const input = tx.inputs[inputIndex]
  const sourceTx = input.sourceTransaction
  if (sourceTx === undefined || input.unlockingScript === undefined) return false
  const source = sourceTx.outputs[input.sourceOutputIndex]
  const spend = new Spend({
    sourceTXID: input.sourceTXID ?? sourceTx.id('hex'),
    sourceOutputIndex: input.sourceOutputIndex,
    sourceSatoshis: source.satoshis!,
    lockingScript: source.lockingScript,
    transactionVersion: tx.version,
    otherInputs: tx.inputs.filter((_, i) => i !== inputIndex),
    outputs: tx.outputs,
    inputIndex,
    unlockingScript: input.unlockingScript as UnlockingScript,
    inputSequence: input.sequence ?? 0xffffffff,
    lockTime: tx.lockTime
  })
  try { return spend.validate() } catch { return false }
}
