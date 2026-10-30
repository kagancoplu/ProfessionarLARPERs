/**
 * verifyLineage on hand-built BSV-21 histories (no network: fetchTx reads a map).
 */
import { describe, expect, it } from 'vitest'
import { P2PKH, PrivateKey, ProtoWallet, PublicKey, Transaction, UnlockingScript, Utils } from '../src/sdk'
import { buildBsv21Script } from '../src/kit/inscription'
import { TOKEN_PROTOCOL } from '../src/kit/addresses'
import { signP2pkhWithScope } from '../src/signers/sighash'
import { verifyLineage, type TxFetcher } from '../src/verify/lineage'

const wallet = new ProtoWallet(PrivateKey.fromRandom())
const key = { protocolID: TOKEN_PROTOCOL, keyID: '0' }
let pkh = ''
const store = new Map<string, Transaction>()
const fetchTx: TxFetcher = async (txid) => { const tx = store.get(txid); if (tx === undefined) throw new Error(`unknown ${txid}`); return Transaction.fromHex(tx.toHex()) }
const keep = (tx: Transaction): Transaction => { store.set(tx.id('hex'), tx); return tx }

function plainSource (satoshis = 1000): Transaction {
  const tx = new Transaction()
  tx.addInput({ sourceTXID: PrivateKey.fromRandom().toHex(), sourceOutputIndex: 0, unlockingScript: new UnlockingScript(), sequence: 0xffffffff })
  tx.addOutput({ lockingScript: new P2PKH().lock(Utils.toArray(pkh, 'hex')), satoshis })
  return keep(tx)
}

/** Spend token outputs (signed for real) into new outputs. */
async function spend (inputs: Array<[Transaction, number]>, outputs: Array<{ amt: string, id: string }>, opts: { badSig?: boolean } = {}): Promise<Transaction> {
  const tx = new Transaction()
  for (const [src, vout] of inputs) tx.addInput({ sourceTransaction: src, sourceOutputIndex: vout, sequence: 0xffffffff })
  for (const o of outputs) tx.addOutput({ lockingScript: buildBsv21Script({ op: 'transfer', id: o.id, amt: o.amt }, pkh), satoshis: 1 })
  for (let i = 0; i < tx.inputs.length; i++) {
    tx.inputs[i].unlockingScript = await signP2pkhWithScope(opts.badSig === true ? new ProtoWallet(PrivateKey.fromRandom()) : wallet, tx, i, key)
  }
  return keep(tx)
}

describe('verifyLineage', () => {
  let tokenId = ''
  let deploy: Transaction

  it('setup: a deploy of 1000', async () => {
    pkh = PublicKey.fromString((await wallet.getPublicKey({ ...key, counterparty: 'anyone', forSelf: true })).publicKey).toHash('hex') as string
    deploy = new Transaction()
    deploy.addInput({ sourceTransaction: plainSource(), sourceOutputIndex: 0, unlockingScript: new UnlockingScript(), sequence: 0xffffffff })
    deploy.addOutput({ lockingScript: buildBsv21Script({ op: 'deploy+mint', sym: 'T', amt: '1000', dec: '0' }, pkh), satoshis: 1 })
    keep(deploy)
    tokenId = `${deploy.id('hex')}_0`
    expect(await verifyLineage(tokenId, { fetchTx })).toMatchObject({ ok: true, tokenId, amt: 1000n, depth: 0 })
  })

  it('accepts transfer → split → merge back to the deploy', async () => {
    const t1 = await spend([[deploy, 0]], [{ id: tokenId, amt: '600' }, { id: tokenId, amt: '400' }])
    expect(await verifyLineage(`${t1.id('hex')}_0`, { fetchTx })).toMatchObject({ ok: true, amt: 600n, ownerPkh: pkh, depth: 1 })
    const merged = await spend([[t1, 0], [t1, 1]], [{ id: tokenId, amt: '1000' }])
    expect(await verifyLineage(`${merged.id('hex')}_0`, { fetchTx })).toMatchObject({ ok: true, amt: 1000n, depth: 2 })
    expect(await verifyLineage(`${merged.id('hex')}_0`, { fetchTx, maxDepth: 1 })).toMatchObject({ ok: false })
  })

  it('refuses a "transfer" minted from plain sats', async () => {
    const forged = new Transaction()
    forged.addInput({ sourceTransaction: plainSource(), sourceOutputIndex: 0, sequence: 0xffffffff })
    forged.addOutput({ lockingScript: buildBsv21Script({ op: 'transfer', id: tokenId, amt: '5000' }, pkh), satoshis: 1 })
    forged.inputs[0].unlockingScript = await signP2pkhWithScope(wallet, forged, 0, key)
    keep(forged)
    expect(await verifyLineage(`${forged.id('hex')}_0`, { fetchTx })).toMatchObject({ ok: false })
  })

  it('refuses inflation, a bad signature on an ancestor, and fetched data that does not hash to the txid', async () => {
    const inflated = await spend([[deploy, 0]], [{ id: tokenId, amt: '1500' }])
    expect((await verifyLineage(`${inflated.id('hex')}_0`, { fetchTx })).ok).toBe(false)

    const badSig = await spend([[deploy, 0]], [{ id: tokenId, amt: '1000' }], { badSig: true })
    expect(await verifyLineage(`${badSig.id('hex')}_0`, { fetchTx })).toMatchObject({ ok: false, reason: expect.stringMatching(/invalid signature/) })

    const honest = await spend([[deploy, 0]], [{ id: tokenId, amt: '1000' }])
    const lying: TxFetcher = async (txid) => (txid === honest.id('hex') ? inflated : await fetchTx(txid))
    expect(await verifyLineage(`${honest.id('hex')}_0`, { fetchTx: lying })).toMatchObject({ ok: false, reason: expect.stringMatching(/hashes to/) })
  })

  it('refuses outputs of another token funded by this one', async () => {
    const otherId = `${'cd'.repeat(32)}_0`
    const cross = await spend([[deploy, 0]], [{ id: otherId, amt: '10' }])
    expect((await verifyLineage(`${cross.id('hex')}_0`, { fetchTx })).ok).toBe(false)
  })
})
