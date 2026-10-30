/**
 * Sighash scopes with a BRC-100 wallet signing hashToDirectlySign (ProtoWallet:
 * the same key derivation as BSV Desktop / wallet-toolbox), checked by the
 * SDK's script interpreter (Spend).
 */
import { describe, expect, it } from 'vitest'
import { P2PKH, PrivateKey, ProtoWallet, PublicKey, Spend, Transaction, UnlockingScript, type LockingScript } from '../src/sdk'
import { P2pkhWalletSigner } from '../src/signers/P2pkhWalletSigner'
import { PLEDGE_PROTOCOL, SIGHASH_ALL_FORKID, SIGHASH_SINGLE_ACP_FORKID } from '../src/types'

const fundingTx = (lockingScript: LockingScript, satoshis: number): Transaction => {
  const tx = new Transaction()
  tx.addInput({ sourceTXID: '00'.repeat(32), sourceOutputIndex: 0, unlockingScript: new UnlockingScript(), sequence: 0xffffffff })
  tx.addOutput({ lockingScript, satoshis })
  return tx
}

function verifyInput (tx: Transaction, i: number): boolean {
  const input = tx.inputs[i]
  const source = input.sourceTransaction!.outputs[input.sourceOutputIndex]
  const spend = new Spend({
    sourceTXID: input.sourceTransaction!.id('hex'),
    sourceOutputIndex: input.sourceOutputIndex,
    sourceSatoshis: source.satoshis!,
    lockingScript: source.lockingScript,
    transactionVersion: tx.version,
    otherInputs: tx.inputs.filter((_, j) => j !== i),
    outputs: tx.outputs,
    inputIndex: i,
    unlockingScript: input.unlockingScript as UnlockingScript,
    inputSequence: input.sequence ?? 0xffffffff,
    lockTime: tx.lockTime
  })
  try { return spend.validate() } catch { return false }
}

async function walletCoin (satoshis: number): Promise<{ wallet: ProtoWallet, key: { protocolID: typeof PLEDGE_PROTOCOL, keyID: string }, source: Transaction }> {
  const wallet = new ProtoWallet(PrivateKey.fromRandom())
  const key = { protocolID: PLEDGE_PROTOCOL, keyID: Math.random().toString(36).slice(2) }
  const { publicKey } = await wallet.getPublicKey({ ...key, counterparty: 'anyone', forSelf: true })
  return { wallet, key, source: fundingTx(new P2PKH().lock(PublicKey.fromString(publicKey).toAddress()), satoshis) }
}

const payTo = (): LockingScript => new P2PKH().lock(PrivateKey.fromRandom().toPublicKey().toAddress())

describe('P2pkhWalletSigner', () => {
  it('signs ALL|FORKID by default and the script verifies', async () => {
    const { wallet, key, source } = await walletCoin(1000)
    const tx = new Transaction()
    tx.addInput({ sourceTransaction: source, sourceOutputIndex: 0, sequence: 0xffffffff })
    tx.addOutput({ lockingScript: payTo(), satoshis: 900 })
    const signer = new P2pkhWalletSigner(wallet, key)
    expect(signer.scope).toBe(SIGHASH_ALL_FORKID)
    expect(signer.unlockingScriptLength).toBe(108)
    tx.inputs[0].unlockingScript = await signer.sign(tx, 0)
    expect(tx.inputs[0].unlockingScript.toBinary().length).toBeLessThanOrEqual(108)
    expect(verifyInput(tx, 0)).toBe(true)
    tx.outputs[0].satoshis = 800 // ALL covers every output
    expect(verifyInput(tx, 0)).toBe(false)
  })

  it('SINGLE|ANYONECANPAY: the offer stays valid when others add inputs and outputs, but not if its paired output changes', async () => {
    // Provider: credit coin at input 0, wants 5000 sats at output 0 (FINAL-IDEA §4.4).
    const provider = await walletCoin(1)
    const providerPay = payTo()
    const tx = new Transaction()
    tx.addInput({ sourceTransaction: provider.source, sourceOutputIndex: 0, sequence: 0xffffffff })
    tx.addOutput({ lockingScript: providerPay, satoshis: 5000 })
    tx.inputs[0].unlockingScript = await new P2pkhWalletSigner(provider.wallet, provider.key, { scope: SIGHASH_SINGLE_ACP_FORKID }).sign(tx, 0)

    // Later, a participant completes the transaction with its own input and outputs, signing ALL.
    const agent = await walletCoin(6000)
    tx.addInput({ sourceTransaction: agent.source, sourceOutputIndex: 0, sequence: 0xffffffff })
    tx.addOutput({ lockingScript: payTo(), satoshis: 1 })   // credits to the agent
    tx.addOutput({ lockingScript: payTo(), satoshis: 800 }) // agent change
    tx.inputs[1].unlockingScript = await new P2pkhWalletSigner(agent.wallet, agent.key).sign(tx, 1)

    expect(verifyInput(tx, 0)).toBe(true) // provider's pre-signed input still valid
    expect(verifyInput(tx, 1)).toBe(true)

    // The coordinator tries to pay the provider less: the provider signature breaks.
    tx.outputs[0].satoshis = 4000
    expect(verifyInput(tx, 0)).toBe(false)
  })

  it('the checksig byte carries the requested scope', async () => {
    const { wallet, key, source } = await walletCoin(1000)
    const tx = new Transaction()
    tx.addInput({ sourceTransaction: source, sourceOutputIndex: 0, sequence: 0xffffffff })
    tx.addOutput({ lockingScript: payTo(), satoshis: 900 })
    const unlock = await new P2pkhWalletSigner(wallet, key, { scope: SIGHASH_SINGLE_ACP_FORKID }).sign(tx, 0)
    const sig = unlock.chunks[0].data!
    expect(sig[sig.length - 1]).toBe(SIGHASH_SINGLE_ACP_FORKID) // 0xc3
  })
})
