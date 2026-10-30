/**
 * Scope-parameterised copy of the kit's signWalletP2pkhInput (client/signer.ts).
 *
 * The app computes the BIP-143 preimage over the FULL source locking script
 * and asks the BRC-100 wallet to sign its hash (`createSignature` with
 * `hashToDirectlySign`): the private key never leaves the wallet. Unlike the
 * kit (always ALL|FORKID), the scope is a parameter, so a provider offer or a
 * market listing can be signed SINGLE|ANYONECANPAY|FORKID (FINAL-IDEA §4.2).
 */
import {
  Hash,
  Signature,
  TransactionSignature,
  UnlockingScript,
  Utils,
  type Transaction,
  type WalletCounterparty,
  type WalletInterface,
  type WalletProtocol
} from '../sdk'
import { SIGHASH_ALL_FORKID } from '../types'

/** The two wallet calls signing needs (BSV Desktop, wallet-toolbox and ProtoWallet all provide them). */
export type SigningWallet = Pick<WalletInterface, 'createSignature' | 'getPublicKey'>

export interface ScopedKeyRef {
  protocolID: WalletProtocol
  keyID: string
  /** Defaults to 'anyone' (the derivation every AgentCoop coin key uses, MASTER §3.2). */
  counterparty?: WalletCounterparty
}

/** BIP-143 preimage hash of `inputIndex` under `scope` (exported for verifiers and tests). */
export function sighashFor (tx: Transaction, inputIndex: number, scope: number): number[] {
  const input = tx.inputs[inputIndex]
  const sourceTx = input.sourceTransaction
  if (sourceTx === undefined) throw new Error(`input ${inputIndex} has no source transaction`)
  const source = sourceTx.outputs[input.sourceOutputIndex]
  const preimage = TransactionSignature.format({
    sourceTXID: input.sourceTXID ?? sourceTx.id('hex'),
    sourceOutputIndex: input.sourceOutputIndex,
    sourceSatoshis: source.satoshis!,
    transactionVersion: tx.version,
    otherInputs: tx.inputs.filter((_, i) => i !== inputIndex),
    inputIndex,
    outputs: tx.outputs,
    inputSequence: input.sequence ?? 0xffffffff,
    subscript: source.lockingScript,
    lockTime: tx.lockTime,
    scope
  })
  return Hash.hash256(preimage)
}

export async function signP2pkhWithScope (
  wallet: SigningWallet,
  tx: Transaction,
  inputIndex: number,
  key: ScopedKeyRef,
  scope: number = SIGHASH_ALL_FORKID,
  originator?: string
): Promise<UnlockingScript> {
  const counterparty = key.counterparty ?? 'anyone'
  const { signature } = await wallet.createSignature({
    hashToDirectlySign: sighashFor(tx, inputIndex, scope),
    protocolID: key.protocolID,
    keyID: key.keyID,
    counterparty
  }, originator)
  const { publicKey } = await wallet.getPublicKey({ protocolID: key.protocolID, keyID: key.keyID, counterparty, forSelf: true }, originator)
  const sig = Signature.fromDER([...signature])
  const checksig = new TransactionSignature(sig.r, sig.s, scope).toChecksigFormat()
  const pub = Utils.toArray(publicKey, 'hex')
  return new UnlockingScript([
    { op: checksig.length, data: checksig },
    { op: pub.length, data: pub }
  ])
}
