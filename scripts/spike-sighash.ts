/**
 * Verification tests 2 + 3 (FINAL-IDEA §12.1) on MAINNET with BSV Desktop.
 *
 *   npx tsx scripts/spike-sighash.ts            (BSV Desktop open and unlocked, ≥ 2,000 sats)
 *
 * 1. Reserve a 1,000-sat coin on a derived pledge key ([1,'agentcoop pledge'],
 *    basket 'agentcoop').
 * 2. Sign it SINGLE|ANYONECANPAY|FORKID via createSignature({ hashToDirectlySign }),
 *    over a transaction that only has input 0 and output 0 (900 sats back to a
 *    derived revenue key of the same wallet). → test 2, wallet side.
 * 3. Ask for a second signature on the same key (test 3: does Desktop prompt
 *    again? Watch the screen and note it in plan/STATUS.md).
 * 4. Complete the transaction in a SECOND createAction: the pre-signed input is
 *    passed with its unlocking script, the wallet adds funding inputs and
 *    change AFTER the offer was signed. Desktop broadcasts it (Arcade).
 * 5. Check status on Arcade and print the WhatsOnChain link.
 *
 * Funds never leave the wallet: both outputs return to keys of this wallet
 * (coin → revenue basket, change → default). Cost ≈ fees only.
 * No key material is read or printed.
 */
import { LockingScript, P2PKH, PublicKey, Random, Transaction, Utils, WalletClient } from '@agentcoop/core/sdk'
import {
  ARCADE_URL,
  PLEDGE_BASKET,
  PLEDGE_PROTOCOL,
  PROVIDER_PROTOCOL,
  REVENUE_BASKET,
  SIGHASH_SINGLE_ACP_FORKID,
  signP2pkhWithScope
} from '@agentcoop/core'

const ORIGINATOR = process.env.APP_ORIGINATOR ?? 'agentcoop.local'
const ARCADE = process.env.ARCADE_URL ?? ARCADE_URL
const COIN_SATS = 1000
const PAYOUT_SATS = 900

const log = (msg: string): void => console.log(`[${new Date().toISOString()}] ${msg}`)

async function derivedP2pkh (wallet: WalletClient, protocolID: typeof PLEDGE_PROTOCOL, keyID: string): Promise<string> {
  const { publicKey } = await wallet.getPublicKey({ protocolID, keyID, counterparty: 'anyone', forSelf: true })
  return new P2PKH().lock(PublicKey.fromString(publicKey).toAddress()).toHex()
}

async function main (): Promise<void> {
  const wallet = new WalletClient('auto', ORIGINATOR)
  await wallet.waitForAuthentication({})
  const { network } = await wallet.getNetwork({})
  if (network !== 'mainnet') throw new Error(`BSV Desktop is on ${network}; this spike is for mainnet`)
  log(`connected to BSV Desktop (${network}) as ${ORIGINATOR}`)

  // 1. Reserve the coin.
  const keyID = Utils.toBase64(Random(12))
  const coinScript = await derivedP2pkh(wallet, PLEDGE_PROTOCOL, keyID)
  const reserve = await wallet.createAction({
    description: 'AgentCoop spike: reserve coin',
    outputs: [{
      lockingScript: coinScript, satoshis: COIN_SATS, outputDescription: 'spike pledge coin', basket: PLEDGE_BASKET,
      customInstructions: JSON.stringify({ protocolID: PLEDGE_PROTOCOL, keyID, counterparty: 'anyone' })
    }],
    options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
  })
  if (reserve.tx === undefined || reserve.txid === undefined) throw new Error('reserve was not completed by the wallet')
  const source = Transaction.fromAtomicBEEF(reserve.tx)
  const vout = source.outputs.findIndex(o => o.lockingScript.toHex() === coinScript)
  log(`reserve tx ${reserve.txid} (coin at vout ${vout})`)

  // 2. Sign SINGLE|ACP over input 0 ↔ output 0 only.
  const revenueKeyID = `spike-${keyID}`
  const payScript = await derivedP2pkh(wallet, PROVIDER_PROTOCOL, revenueKeyID)
  const offerTx = new Transaction()
  offerTx.addInput({ sourceTransaction: source, sourceOutputIndex: vout, sequence: 0xffffffff })
  offerTx.addOutput({ lockingScript: LockingScript.fromHex(payScript), satoshis: PAYOUT_SATS })
  log('requesting SINGLE|ANYONECANPAY signature #1 (watch BSV Desktop for a prompt)…')
  const t1 = Date.now()
  const unlock = await signP2pkhWithScope(wallet, offerTx, 0, { protocolID: PLEDGE_PROTOCOL, keyID }, SIGHASH_SINGLE_ACP_FORKID)
  log(`signature #1 returned after ${Date.now() - t1} ms`)

  // 3. Second signature on the same protocol (test 3: prompt behaviour).
  log('requesting signature #2 on the same protocol (does Desktop prompt again?)…')
  const t2 = Date.now()
  await signP2pkhWithScope(wallet, offerTx, 0, { protocolID: PLEDGE_PROTOCOL, keyID }, SIGHASH_SINGLE_ACP_FORKID)
  log(`signature #2 returned after ${Date.now() - t2} ms`)

  // 4. Complete: the wallet adds funding inputs and change after the offer signature exists.
  const done = await wallet.createAction({
    description: 'AgentCoop spike: complete offer',
    inputBEEF: source.toBEEF(),
    inputs: [{ outpoint: `${reserve.txid}.${vout}`, unlockingScript: unlock.toHex(), inputDescription: 'pre-signed SINGLE|ACP coin' }],
    outputs: [{
      lockingScript: payScript, satoshis: PAYOUT_SATS, outputDescription: 'offer payout', basket: REVENUE_BASKET,
      customInstructions: JSON.stringify({ protocolID: PROVIDER_PROTOCOL, keyID: revenueKeyID, counterparty: 'anyone' })
    }],
    options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
  })
  if (done.txid === undefined || done.tx === undefined) throw new Error('completion was not completed by the wallet')
  const tx = Transaction.fromAtomicBEEF(done.tx)
  const scope = tx.inputs[0].unlockingScript?.chunks[0].data?.at(-1)
  log(`settled-style tx ${done.txid}: ${tx.inputs.length} inputs, ${tx.outputs.length} outputs, input 0 sighash byte 0x${(scope ?? 0).toString(16)}`)

  // 5. Arcade status.
  const status = await fetch(`${ARCADE}/tx/${done.txid}`).then(async r => (r.ok ? await r.json() as { txStatus?: string } : { txStatus: `HTTP ${r.status}` }))
  log(`Arcade status: ${status.txStatus ?? 'unknown'}`)
  console.log(JSON.stringify({
    test: 'verification 2+3',
    reserveTxid: reserve.txid,
    spikeTxid: done.txid,
    inputs: tx.inputs.length,
    input0Scope: `0x${(scope ?? 0).toString(16)}`,
    arcade: status.txStatus,
    woc: `https://whatsonchain.com/tx/${done.txid}`,
    note: 'Record in plan/STATUS.md: how many BSV Desktop prompts appeared for signatures #1 and #2'
  }, null, 2))
}

main().catch(e => { console.error('spike failed:', e instanceof Error ? e.message : e); process.exit(1) })
