/**
 * Validation test 4 (MASTER-PLAN §5 / FINAL-IDEA §12.1): nLockTime semantics on BSV mainnet,
 * the assumption under Coop Rail's pre-signed refund (D-P3 §4.4). ≤ 1,000 sats, from one server wallet.
 *
 *   npm run validation4 -w @agentcoop/scripts                    # dry run: plan + current height
 *   npm run validation4 -w @agentcoop/scripts -- --yes [--wallet maker]
 *
 * 1. a 600-sat coin to the wallet's own key ([1,'agentcoop rail'], keyID `validation4 <ts>`)
 * 2. a spend of it with nLockTime = now + 15 min (time based), sequence 0xfffffffe → Arcade (expected: non-final)
 * 3. the same spend with nLockTime = height + 2 → Arcade (expected: non-final)
 * 4. wait until the tip reaches height + 2, send again (expected: accepted); the output is taken back into the wallet
 *
 * Interrupted while waiting (a network error used to end it, 31.10)? Resume without a new coin:
 *   npm run validation4 -w @agentcoop/scripts -- --yes --resume <coinTxid> --lock <height>
 * Prints the Arcade answers and the STATUS lines. Run on the treasury laptop (Node 24, .env); never in CI.
 */
import { LockingScript, P2PKH, PublicKey, Transaction, type WalletInterface } from '@agentcoop/core/sdk'
import { broadcastEF, fetchChainPolicy, signP2pkhWithScope } from '@agentcoop/core'
import { RAIL_PROTOCOL, RAIL_REFUND_SEQUENCE } from '@agentcoop/core/scripts/htlc'
import { arcadeUrl, chain } from './lib/env'
import { flag, option, run } from './lib/cli'
import { openWallet } from './wallets'

const COIN = 600
const FEE = 40

async function ownScript (w: WalletInterface, keyID: string): Promise<string> {
  const { publicKey } = await w.getPublicKey({ protocolID: RAIL_PROTOCOL, keyID, counterparty: 'anyone', forSelf: true })
  return new P2PKH().lock(PublicKey.fromString(publicKey).toAddress()).toHex()
}

const sleep = async (ms: number): Promise<void> => await new Promise(resolve => setTimeout(resolve, ms))

run(async () => {
  const args = process.argv.slice(2)
  const name = option(args, '--wallet') ?? 'maker'
  const arcade = arcadeUrl()
  const { height } = await fetchChainPolicy(arcade)
  console.log(`Validation 4 · ${chain()} · Arcade ${arcade} · height ${height} · wallet ${name} · coin ${COIN} sat`)
  if (!flag(args, '--yes')) { console.log('dry run: add --yes (spends ≤ 1,000 sats; waits ~20–40 min for 2 blocks)'); return }
  if (chain() !== 'main') throw new Error('validation 4 is a mainnet test')

  const { wallet, close } = await openWallet(name)
  try {
    // The chain tip, retried: one failed request must not end a 20-minute wait.
    const tipOf = async (): Promise<number> => {
      for (let i = 1; ; i++) {
        try { return (await fetchChainPolicy(arcade)).height } catch (e) {
          if (i >= 20) throw e
          console.log(`  (height lookup failed: ${(e as Error).message}; retrying)`)
          await sleep(10_000)
        }
      }
    }
    const resume = option(args, '--resume')
    let keyID: string
    let source: Transaction
    let vout: number
    if (resume !== undefined) {
      // The probe coin from an interrupted run, with its key, from the wallet's basket.
      const list = await wallet.listOutputs({ basket: 'agentcoop rail', include: 'entire transactions', includeCustomInstructions: true, limit: 1000 })
      const entry = list.outputs.find(o => o.outpoint.startsWith(`${resume}.`) && o.spendable)
      if (entry?.customInstructions === undefined || list.BEEF === undefined) throw new Error(`no spendable probe coin ${resume} in 'agentcoop rail'`)
      keyID = (JSON.parse(entry.customInstructions) as { keyID: string }).keyID
      source = Transaction.fromBEEF(Array.from(list.BEEF), resume)
      vout = Number(entry.outpoint.split('.')[1])
      console.log(`T-v4 coin (resumed): ${resume}`)
    } else {
      keyID = `validation4 ${Date.now()}`
      const coinScript = await ownScript(wallet, keyID)
      const res = await wallet.createAction({
        description: 'AgentCoop validation 4: nLockTime probe',
        outputs: [{ lockingScript: coinScript, satoshis: COIN, outputDescription: 'nLockTime probe coin', basket: 'agentcoop rail', customInstructions: JSON.stringify({ protocolID: RAIL_PROTOCOL, keyID }) }],
        options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
      })
      if (res.txid === undefined || res.tx === undefined) throw new Error('probe coin was not created')
      source = Transaction.fromAtomicBEEF(res.tx)
      vout = source.outputs.findIndex(o => o.lockingScript.toHex() === coinScript)
      console.log(`T-v4 coin: ${res.txid}`)
    }
    const backKey = `${keyID} back`
    const backScript = await ownScript(wallet, backKey)

    const spend = async (lockTime: number): Promise<Transaction> => {
      const tx = new Transaction(1, [], [], lockTime)
      tx.addInput({ sourceTransaction: source, sourceOutputIndex: vout, sequence: RAIL_REFUND_SEQUENCE })
      tx.addOutput({ lockingScript: LockingScript.fromHex(backScript), satoshis: COIN - FEE })
      tx.inputs[0].unlockingScript = await signP2pkhWithScope(wallet, tx, 0, { protocolID: RAIL_PROTOCOL, keyID })
      return tx
    }
    const attempt = async (label: string, tx: Transaction): Promise<boolean> => {
      try { await broadcastEF(tx, arcade); console.log(`  ${label}: ACCEPTED ${tx.id('hex')}`); return true } catch (e) { console.log(`  ${label}: refused · ${(e as Error).message}`); return false }
    }

    let lock: number
    const resumedLock = option(args, '--lock')
    if (resume !== undefined && resumedLock !== undefined) {
      lock = Number(resumedLock) // its early send was refused in the interrupted run
    } else {
      const timeLock = Math.floor(Date.now() / 1000) + 15 * 60
      await attempt(`time-based nLockTime ${timeLock} (now + 15 min)`, await spend(timeLock))
      lock = (await tipOf()) + 2
      const early = await spend(lock)
      if (await attempt(`height-based nLockTime ${lock} at tip ${await tipOf()}`, early)) {
        console.log('  ✗ unexpected: a non-final transaction was accepted early'); return
      }
    }
    for (;;) {
      const tip = await tipOf()
      if (tip >= lock) break
      console.log(`  waiting for height ${lock} (tip ${tip})…`)
      await sleep(30_000)
    }
    const final = await spend(lock)
    if (await attempt(`height-based nLockTime ${lock} at tip ≥ ${lock}`, final)) {
      await wallet.internalizeAction({
        tx: final.toAtomicBEEF(),
        outputs: [{ outputIndex: 0, protocol: 'basket insertion', insertionRemittance: { basket: 'agentcoop rail', customInstructions: JSON.stringify({ protocolID: RAIL_PROTOCOL, keyID: backKey }) } }],
        description: 'AgentCoop validation 4: probe back'
      }).catch(e => { console.log(`  note: internalize failed (${(e as Error).message}); the output is the wallet's key ${backKey}`) })
      console.log(`STATUS: | ${new Date().toISOString().slice(0, 16)} | T11 nLockTime probe (validation 4) | ${final.id('hex')} | D | lock ${lock}; early send refused |`)
    }
  } finally {
    await close()
  }
})
