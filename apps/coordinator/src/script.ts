import { Spend, type Transaction } from '@agentcoop/core/sdk'

/** Run the script interpreter on one input of a transaction whose inputs carry sourceTransaction (true = valid). */
export function inputIsValid (tx: Transaction, inputIndex: number): boolean {
  const input = tx.inputs[inputIndex]
  const source = input?.sourceTransaction?.outputs[input.sourceOutputIndex]
  if (input === undefined || source === undefined || input.unlockingScript === undefined) return false
  try {
    return new Spend({
      sourceTXID: input.sourceTXID ?? input.sourceTransaction!.id('hex'),
      sourceOutputIndex: input.sourceOutputIndex,
      sourceSatoshis: source.satoshis ?? 0,
      lockingScript: source.lockingScript,
      transactionVersion: tx.version,
      otherInputs: tx.inputs.filter((_, i) => i !== inputIndex),
      outputs: tx.outputs,
      unlockingScript: input.unlockingScript,
      inputSequence: input.sequence ?? 0xffffffff,
      inputIndex,
      lockTime: tx.lockTime
    }).validate()
  } catch {
    return false
  }
}
