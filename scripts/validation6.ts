/**
 * Validation test 6 (MASTER-PLAN §5 / FINAL-IDEA §12.1, docs/RAIL-POC.md › Validation 6): are version 1
 * transactions malleable on BSV mainnet? Chronicle relaxes the malleability rules only for version > 1, so a
 * high-S signature (the other valid form of the same ECDSA signature, which changes the txid) should be refused
 * in a version 1 transaction and may be accepted in a version 2 one. Coop Rail's pre-signed refund relies on the
 * version 1 funding keeping its txid. ≤ 1,000 sats from one server wallet, nearly all of it returned.
 *
 *   npm run validation6 -w @agentcoop/scripts                    # dry run
 *   npm run validation6 -w @agentcoop/scripts -- --yes [--wallet maker]
 *
 * 1. two 450-sat coins to the wallet's own keys ([1,'agentcoop rail'], keyID `validation6 <ts> v1|v2`)
 * 2. for version 1, then version 2: spend the coin back to the wallet with a HIGH-S signature → Arcade
 * 3. if that is refused, the same spend with the normal low-S signature (expected: accepted) recovers the coin
 * Prints Arcade's answers and the STATUS lines. Run on the treasury laptop (Node 24, .env); never in CI.
 */
import { Curve, LockingScript, P2PKH, PublicKey, Signature, Transaction, TransactionSignature, UnlockingScript, type WalletInterface } from '@agentcoop/core/sdk'
import { broadcastEF, signP2pkhWithScope } from '@agentcoop/core'
import { RAIL_PROTOCOL } from '@agentcoop/core/scripts/htlc'
import { arcadeUrl, chain, wocTxUrl } from './lib/env'
import { flag, option, run } from './lib/cli'
import { openWallet } from './wallets'

const COIN = 450
const FEE = 40
const N = new Curve().n

async function ownScript (w: WalletInterface, keyID: string): Promise<string> {
  const { publicKey } = await w.getPublicKey({ protocolID: RAIL_PROTOCOL, keyID, counterparty: 'anyone', forSelf: true })
  return new P2PKH().lock(PublicKey.fromString(publicKey).toAddress()).toHex()
}

/** The same unlock with s replaced by n − s: an equally valid ECDSA signature, a different txid. */
function highS (unlock: UnlockingScript): UnlockingScript {
  const [sigChunk, pubChunk] = unlock.chunks
  const der = sigChunk.data!.slice(0, -1)
  const scope = sigChunk.data![sigChunk.data!.length - 1]
  const sig = Signature.fromDER(der)
  const s = N.sub(sig.s)
  if (s.cmp(N.ushrn(1)) <= 0) throw new Error('expected the wallet to sign low-S')
  const checksig = new TransactionSignature(sig.r, s, scope).toChecksigFormat()
  return new UnlockingScript([{ op: checksig.length, data: checksig }, pubChunk])
}

run(async () => {
  const args = process.argv.slice(2)
  const name = option(args, '--wallet') ?? 'maker'
  const arcade = arcadeUrl()
  console.log(`Validation 6 · ${chain()} · Arcade ${arcade} · wallet ${name} · 2 coins × ${COIN} sat`)
  if (!flag(args, '--yes')) { console.log('dry run: add --yes (spends ≤ 1,000 sats, ~100 of them in fees)'); return }
  if (chain() !== 'main') throw new Error('validation 6 is a mainnet test')

  const { wallet, close } = await openWallet(name)
  try {
    const stamp = `validation6 ${Date.now()}`
    const keys = { v1: `${stamp} v1`, v2: `${stamp} v2` }
    const scripts = { v1: await ownScript(wallet, keys.v1), v2: await ownScript(wallet, keys.v2) }
    const res = await wallet.createAction({
      description: 'AgentCoop validation 6: malleability probe',
      outputs: (['v1', 'v2'] as const).map(v => ({
        lockingScript: scripts[v], satoshis: COIN, outputDescription: `malleability probe ${v}`, basket: 'agentcoop rail',
        customInstructions: JSON.stringify({ protocolID: RAIL_PROTOCOL, keyID: keys[v] })
      })),
      options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
    })
    if (res.txid === undefined || res.tx === undefined) throw new Error('probe coins were not created')
    const source = Transaction.fromAtomicBEEF(res.tx)
    console.log(`T-v6 coins: ${res.txid}`)

    const rows: string[] = []
    for (const [v, version] of [['v1', 1], ['v2', 2]] as const) {
      const vout = source.outputs.findIndex(o => o.lockingScript.toHex() === scripts[v])
      const backKey = `${keys[v]} back`
      const tx = new Transaction(version, [], [], 0)
      tx.addInput({ sourceTransaction: source, sourceOutputIndex: vout, sequence: 0xffffffff })
      tx.addOutput({ lockingScript: LockingScript.fromHex(await ownScript(wallet, backKey)), satoshis: COIN - FEE })
      const low = await signP2pkhWithScope(wallet, tx, 0, { protocolID: RAIL_PROTOCOL, keyID: keys[v] })
      tx.inputs[0].unlockingScript = highS(low)
      const highTxid = tx.id('hex')
      let sent: Transaction | undefined
      let answer: string
      try {
        await broadcastEF(tx, arcade)
        answer = `ACCEPTED ${highTxid}`
        sent = tx
      } catch (e) {
        answer = `refused · ${(e as Error).message}`
      }
      console.log(`  version ${version}, high-S: ${answer}`)
      let lowAnswer = '-'
      if (sent === undefined) {
        tx.inputs[0].unlockingScript = low
        try { await broadcastEF(tx, arcade); lowAnswer = `ACCEPTED ${tx.id('hex')}`; sent = tx } catch (e) { lowAnswer = `refused · ${(e as Error).message}` }
        console.log(`  version ${version}, low-S (recovery): ${lowAnswer}`)
      }
      if (sent !== undefined) {
        await wallet.internalizeAction({
          tx: sent.toAtomicBEEF(),
          outputs: [{ outputIndex: 0, protocol: 'basket insertion', insertionRemittance: { basket: 'agentcoop rail', customInstructions: JSON.stringify({ protocolID: RAIL_PROTOCOL, keyID: backKey }) } }],
          description: `AgentCoop validation 6: probe ${v} back`
        }).catch(e => { console.log(`  note: internalize failed (${(e as Error).message}); the output is the wallet's key ${backKey}`) })
      }
      const t = new Date().toISOString().slice(0, 16)
      rows.push(`| ${t} | validation 6 version ${version} | ${sent?.id('hex') ?? '-'} | D | high-S: ${answer.startsWith('ACCEPTED') ? 'accepted (malleable)' : 'refused'}${sent !== undefined && !answer.startsWith('ACCEPTED') ? '; low-S accepted' : ''} |`)
    }
    console.log(`\ncoins ${wocTxUrl(res.txid)}`)
    console.log('STATUS:')
    for (const r of rows) console.log(r)
  } finally {
    await close()
  }
})
