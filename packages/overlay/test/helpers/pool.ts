/**
 * TEST-ONLY pool, pledge and cancel transactions in the MASTER §3.3 layouts
 * (Track B, Faz 1). Stand-ins for Track A's buildReserveAndAnnounce /
 * buildPledge / cancelPledge until @agentcoop/core exists.
 */
import { Random, Transaction, Utils, type WalletInterface } from '@agentcoop/core/sdk'
import { buildBsv21Script } from '@agentcoop/core'
import { instructionsFor, receivePkh, TOKEN_BASKET, TOKEN_PROTOCOL } from '@agentcoop/core'
import { buildOpReturn } from '@agentcoop/core'
import type { PoolTerms } from '@agentcoop/core'
import { coinFrom, deployCredits, p2pkhFor, PLEDGE_PROTOCOL, providerPayScript, SCOPE_ALL, signInput, type Coin, type KeyRef } from './settlement'

const UNLOCK_P2PKH = 108

/** createAction with one custom P2PKH input + signAction (kit TokenKit.spendInputs pattern). */
export async function spendCoin (wallet: WalletInterface, coin: Coin, outputs: any[], description: string): Promise<number[]> {
  const created = await wallet.createAction({
    description,
    inputBEEF: coin.sourceTransaction.toBEEF(),
    inputs: [{ outpoint: `${coin.sourceTransaction.id('hex')}.${coin.vout}`, unlockingScriptLength: UNLOCK_P2PKH, inputDescription: 'custom input' }],
    outputs,
    options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
  })
  const signable = created.signableTransaction!
  const tx = Transaction.fromAtomicBEEF(signable.tx)
  const i = tx.inputs.findIndex(inp => inp.sourceTXID === coin.sourceTransaction.id('hex') && inp.sourceOutputIndex === coin.vout)
  tx.inputs[i].sourceTransaction ??= coin.sourceTransaction
  const unlockingScript = await signInput(wallet, tx, i, coin.key, SCOPE_ALL)
  const signed = await wallet.signAction({ reference: signable.reference, spends: { [i]: { unlockingScript: unlockingScript.toHex() } }, options: { acceptDelayedBroadcast: false } })
  return Array.from(signed.tx!)
}

export interface OpenedPool {
  poolId: string
  terms: PoolTerms
  /** the N-credit UTXO at out0 of the pool tx (= the offer input) */
  credit: Coin
  /** AtomicBEEF of the deploy and pool transactions, in order */
  deployTx: number[]
  poolTx: number[]
}

/** Deploy N credits, then move them to one UTXO at out0 with an `OP_RETURN pool` record (Track A 1.1 layout). */
export async function openPool (provider: WalletInterface, opts: { credits?: bigint, priceSats?: number, feeSats?: number, minCredits?: number, deadlineHeight?: number } = {}): Promise<OpenedPool> {
  const N = opts.credits ?? 1000n
  const { publicKey: me } = await provider.getPublicKey({ identityKey: true })
  const d = await deployCredits(provider, N)
  const poolNonce = Utils.toHex(Random(8))
  const record = {
    v: '1',
    provider: me,
    providerApi: 'http://localhost:8092',
    tokenId: d.tokenId,
    credits: N.toString(),
    priceSats: String(opts.priceSats ?? 4_500),
    payScriptHex: (await providerPayScript(provider, poolNonce)).toHex(),
    feeSats: String(opts.feeSats ?? 200),
    minCredits: String(opts.minCredits ?? 10),
    deadlineHeight: String(opts.deadlineHeight ?? 10_000),
    label: '8×H100 · 1 week (test)',
    retailSatsPerCredit: '9'
  }
  const creditScript = buildBsv21Script({ op: 'transfer', id: d.tokenId, amt: N.toString() }, receivePkh(me, 1))
  const poolTx = await spendCoin(provider, d.coin, [
    { lockingScript: creditScript.toHex(), satoshis: 1, outputDescription: 'pool credits', basket: TOKEN_BASKET, customInstructions: JSON.stringify(instructionsFor(1)) },
    { lockingScript: buildOpReturn('pool', record).toHex(), satoshis: 0, outputDescription: 'pool record' }
  ], 'Open AgentCoop pool')
  const credit = coinFrom(poolTx, creditScript, { protocolID: TOKEN_PROTOCOL, keyID: '1' })
  if (credit.vout !== 0) throw new Error('credit UTXO must be out0')
  const poolId = `${credit.sourceTransaction.id('hex')}_0`
  return { poolId, terms: { ...record, poolId } as PoolTerms, credit, deployTx: Array.from(d.coin.sourceTransaction.toAtomicBEEF()), poolTx }
}

export interface Pledge { coin: Coin, tx: number[], txid: string, identityKey: string, credits: bigint }

/** MASTER §3.3 pledge tx: out0 pledge coin, out1 feeSats → payScript, out2 OP_RETURN pledge. */
export async function pledge (wallet: WalletInterface, pool: { poolId: string, terms: PoolTerms }, credits: bigint, opts: { feeSats?: number, coinSats?: number } = {}): Promise<Pledge> {
  const { publicKey: me } = await wallet.getPublicKey({ identityKey: true })
  const key: KeyRef = { protocolID: PLEDGE_PROTOCOL, keyID: Utils.toHex(Random(16)) }
  const coinScript = await p2pkhFor(wallet, key)
  const N = BigInt(pool.terms.credits)
  const share = (credits * BigInt(pool.terms.priceSats) + N - 1n) / N
  const coinSats = opts.coinSats ?? Number(share) + 1 + 400 // share + credit output + fee buffer
  const res = await wallet.createAction({
    description: 'AgentCoop pledge',
    outputs: [
      { lockingScript: coinScript.toHex(), satoshis: coinSats, outputDescription: 'pledge coin', basket: 'agentcoop', customInstructions: JSON.stringify({ ...key, counterparty: 'anyone' }) },
      { lockingScript: pool.terms.payScriptHex, satoshis: opts.feeSats ?? Number(pool.terms.feeSats), outputDescription: 'registration fee' },
      {
        lockingScript: buildOpReturn('pledge', { v: '1', poolId: pool.poolId, credits: credits.toString(), participant: me, tokenIndex: '0', signer: 'p2pkh' }).toHex(),
        satoshis: 0,
        outputDescription: 'pledge record'
      }
    ],
    options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
  })
  const coin = coinFrom(res.tx!, coinScript, key)
  return { coin, tx: Array.from(res.tx!), txid: res.txid!, identityKey: me, credits }
}

/** T4: spend the pledge coin back to a fresh pledge-key coin of the same wallet. */
export async function cancelPledge (wallet: WalletInterface, coin: Coin): Promise<number[]> {
  const key: KeyRef = { protocolID: PLEDGE_PROTOCOL, keyID: Utils.toHex(Random(16)) }
  const script = await p2pkhFor(wallet, key)
  return await spendCoin(wallet, coin, [
    { lockingScript: script.toHex(), satoshis: coin.satoshis, outputDescription: 'cancelled pledge', basket: 'agentcoop', customInstructions: JSON.stringify({ ...key, counterparty: 'anyone' }) }
  ], 'Cancel AgentCoop pledge')
}

/** Provider spends the pool's credit UTXO outside a settlement (cancels the pool). */
export async function withdrawPoolCredits (provider: WalletInterface, pool: OpenedPool): Promise<number[]> {
  const { publicKey: me } = await provider.getPublicKey({ identityKey: true })
  const script = buildBsv21Script({ op: 'transfer', id: pool.terms.tokenId, amt: pool.terms.credits }, receivePkh(me, 2))
  return await spendCoin(provider, pool.credit, [
    { lockingScript: script.toHex(), satoshis: 1, outputDescription: 'credits back', basket: TOKEN_BASKET, customInstructions: JSON.stringify(instructionsFor(2)) }
  ], 'Cancel AgentCoop pool')
}

/** AtomicBEEF → plain BEEF for POST /submit (kit OverlayClient.submit does the same). */
export const beefOf = (atomicBeef: number[]): number[] => Transaction.fromAtomicBEEF(atomicBeef).toBEEF()
