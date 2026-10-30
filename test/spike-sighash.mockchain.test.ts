/**
 * Verification test 2 (FINAL-IDEA §12.1), offline half: a coin held in one
 * BRC-100 wallet is signed SINGLE|ANYONECANPAY|FORKID through
 * createSignature({ hashToDirectlySign }), and a DIFFERENT wallet later
 * completes the transaction with its own inputs, outputs and change. The mock
 * chain checks every script. This is the provider-offer primitive (§4.4).
 * The mainnet half (BSV Desktop) is scripts/spike-sighash.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Wallet } from '@bsv/wallet-toolbox'
import { LockingScript, P2PKH, PrivateKey, PublicKey, Random, Transaction, Utils } from '@agentcoop/core/sdk'
import { PLEDGE_BASKET, PLEDGE_PROTOCOL, SIGHASH_SINGLE_ACP_FORKID, signP2pkhWithScope } from '@agentcoop/core'
import { createMockChain, type MockChain } from './helpers/mockchain'

let chain: MockChain
beforeAll(async () => { chain = await createMockChain() })
afterAll(async () => { await chain?.close() })

/** Reserve a 1,000-sat coin on a derived pledge key in the 'agentcoop' basket (as the spike does on Desktop). */
async function reserveCoin (wallet: Wallet, satoshis: number): Promise<{ source: Transaction, vout: number, keyID: string }> {
  const keyID = Utils.toBase64(Random(12))
  const { publicKey } = await wallet.getPublicKey({ protocolID: PLEDGE_PROTOCOL, keyID, counterparty: 'anyone', forSelf: true })
  const lockingScript = new P2PKH().lock(PublicKey.fromString(publicKey).toAddress()).toHex()
  const res = await wallet.createAction({
    description: 'Reserve pledge coin',
    outputs: [{
      lockingScript, satoshis, outputDescription: 'pledge coin', basket: PLEDGE_BASKET,
      customInstructions: JSON.stringify({ protocolID: PLEDGE_PROTOCOL, keyID, counterparty: 'anyone' })
    }],
    options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
  })
  const source = Transaction.fromAtomicBEEF(res.tx!)
  const vout = source.outputs.findIndex(o => o.lockingScript.toHex() === lockingScript)
  return { source, vout, keyID }
}

describe('spike: SINGLE|ANYONECANPAY by one wallet, completed by another', () => {
  let offerer: Wallet, completer: Wallet
  const payScript = new P2PKH().lock(PrivateKey.fromRandom().toPublicKey().toAddress()).toHex()

  it('sets up two funded wallet-toolbox wallets', async () => {
    offerer = await chain.makeWallet()
    completer = await chain.makeWallet()
    await chain.fund(offerer)
    await chain.fund(completer)
  })

  async function presign (payout: number): Promise<{ outpoint: string, unlockingScript: string, beef: number[] }> {
    const { source, vout, keyID } = await reserveCoin(offerer, 1000)
    // The offer: input 0 = my coin, output 0 = pay me `payout`. Nothing else exists yet.
    const offerTx = new Transaction()
    offerTx.addInput({ sourceTransaction: source, sourceOutputIndex: vout, sequence: 0xffffffff })
    offerTx.addOutput({ lockingScript: LockingScript.fromHex(payScript), satoshis: payout })
    const unlock = await signP2pkhWithScope(offerer, offerTx, 0, { protocolID: PLEDGE_PROTOCOL, keyID }, SIGHASH_SINGLE_ACP_FORKID)
    return { outpoint: `${source.id('hex')}.${vout}`, unlockingScript: unlock.toHex(), beef: source.toBEEF() }
  }

  it('the completer adds its own funding and change; the network accepts the offer signature', async () => {
    const offer = await presign(900)
    const res = await completer.createAction({
      description: 'Complete a pre-signed offer',
      inputBEEF: offer.beef,
      inputs: [{ outpoint: offer.outpoint, unlockingScript: offer.unlockingScript, inputDescription: 'pre-signed offer' }],
      outputs: [
        { lockingScript: payScript, satoshis: 900, outputDescription: 'pay the offerer' },
        { lockingScript: new P2PKH().lock(PrivateKey.fromRandom().toPublicKey().toAddress()).toHex(), satoshis: 2500, outputDescription: 'completer output' }
      ],
      options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
    })
    expect(res.txid).toMatch(/^[0-9a-f]{64}$/)
    const tx = Transaction.fromAtomicBEEF(res.tx!)
    const [offerTxid, offerVout] = offer.outpoint.split('.')
    expect(tx.inputs[0].sourceTXID ?? tx.inputs[0].sourceTransaction?.id('hex')).toBe(offerTxid)
    expect(tx.inputs[0].sourceOutputIndex).toBe(Number(offerVout))
    expect(tx.outputs[0]).toMatchObject({ satoshis: 900 })
    expect(tx.outputs[0].lockingScript.toHex()).toBe(payScript)
    expect(tx.inputs.length).toBeGreaterThan(1) // the completer funded it
    expect(await tx.verify('scripts only')).toBe(true)
  })

  it('paying the offerer less breaks the offer signature (the wallet refuses it)', async () => {
    const offer = await presign(900)
    await expect(completer.createAction({
      description: 'Underpay a pre-signed offer',
      inputBEEF: offer.beef,
      inputs: [{ outpoint: offer.outpoint, unlockingScript: offer.unlockingScript, inputDescription: 'pre-signed offer' }],
      outputs: [{ lockingScript: payScript, satoshis: 800, outputDescription: 'underpay the offerer' }],
      options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
    })).rejects.toThrow(/Script evaluation error/) // the wallet itself refuses the broken offer signature
  })
})
