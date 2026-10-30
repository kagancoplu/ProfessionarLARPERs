/**
 * InputSigner (MASTER-PLAN §3.3) for a P2PKH-suffixed coin whose key lives in a
 * BRC-100 wallet (BSV Desktop or wallet-toolbox): pledge coins, provider credit
 * UTXOs, listings. Track D's VaultSigner implements the same interface.
 */
import type { Transaction, UnlockingScript } from '../sdk'
import { P2PKH_UNLOCKING_SCRIPT_LENGTH, SIGHASH_ALL_FORKID, type InputSigner } from '../types'
import { signP2pkhWithScope, type ScopedKeyRef, type SigningWallet } from './sighash'

export class P2pkhWalletSigner implements InputSigner {
  readonly unlockingScriptLength = P2PKH_UNLOCKING_SCRIPT_LENGTH
  readonly scope: number

  constructor (
    readonly wallet: SigningWallet,
    readonly key: ScopedKeyRef,
    opts: { scope?: number, originator?: string } = {}
  ) {
    this.scope = opts.scope ?? SIGHASH_ALL_FORKID
    this.originator = opts.originator
  }

  private readonly originator?: string

  async sign (tx: Transaction, inputIndex: number): Promise<UnlockingScript> {
    return await signP2pkhWithScope(this.wallet, tx, inputIndex, this.key, this.scope, this.originator)
  }
}
