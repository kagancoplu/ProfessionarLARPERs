/**
 * TEST-ONLY helpers for validation test 1 (Track B, Faz 0): build, sign and
 * submit a mixed AgentCoop settlement (FINAL-IDEA §4.4) with wallet-toolbox
 * wallets on the mock chain.
 *
 * This is NOT Track A's builder. Once @agentcoop/core has planSettlement /
 * assembleSettlement / P2pkhWalletSigner (A.P1), tests should switch to them.
 */
import {
  Beef,
  Hash,
  P2PKH,
  PublicKey,
  Random,
  Signature,
  Spend,
  Transaction,
  TransactionSignature,
  UnlockingScript,
  Utils,
  type LockingScript,
  type WalletInterface,
  type WalletProtocol
} from '@bsv/sdk'
import { buildBsv21Script } from '../../src/kit/inscription'
import { receivePkh, TOKEN_BASKET, TOKEN_PROTOCOL, instructionsFor } from '../../src/kit/addresses'
import { agentcoopOpReturn } from '../../scripts/settlementSize'

export const SCOPE_ALL = TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID
export const SCOPE_SINGLE_ACP = TransactionSignature.SIGHASH_SINGLE | TransactionSignature.SIGHASH_ANYONECANPAY | TransactionSignature.SIGHASH_FORKID

export const PLEDGE_PROTOCOL: WalletProtocol = [1, 'agentcoop pledge']
export const PROVIDER_PROTOCOL: WalletProtocol = [1, 'agentcoop provider']

export interface KeyRef { protocolID: WalletProtocol, keyID: string }

/** A spendable output plus the key that unlocks it. */
export interface Coin {
  sourceTransaction: Transaction
  vout: number
  satoshis: number
  lockingScript: LockingScript
  key: KeyRef
}

export const p2pkhFor = async (wallet: WalletInterface, key: KeyRef): Promise<LockingScript> => {
  const { publicKey } = await wallet.getPublicKey({ ...key, counterparty: 'anyone', forSelf: true })
  return new P2PKH().lock(PublicKey.fromString(publicKey).toAddress())
}

export const coinFrom = (atomicBeef: number[] | Uint8Array, lockingScript: LockingScript, key: KeyRef): Coin => {
  const tx = Transaction.fromAtomicBEEF(Array.from(atomicBeef))
  const vout = tx.outputs.findIndex(o => o.lockingScript.toHex() === lockingScript.toHex())
  if (vout === -1) throw new Error('output not found by locking script')
  return { sourceTransaction: tx, vout, satoshis: tx.outputs[vout].satoshis!, lockingScript, key }
}

/** Provider: deploy+mint `amt` credits to its receive key #0 (kit addressing). */
export async function deployCredits (provider: WalletInterface, amt: bigint, sym = 'GPU'): Promise<{ tokenId: string, coin: Coin }> {
  const { publicKey: me } = await provider.getPublicKey({ identityKey: true })
  const lockingScript = buildBsv21Script({ op: 'deploy+mint', amt: amt.toString(), sym, dec: '0' }, receivePkh(me, 0))
  const res = await provider.createAction({
    description: `Deploy ${sym} credits`,
    outputs: [{
      lockingScript: lockingScript.toHex(),
      satoshis: 1,
      outputDescription: 'credit supply',
      basket: TOKEN_BASKET,
      customInstructions: JSON.stringify(instructionsFor(0))
    }],
    options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
  })
  const coin = coinFrom(res.tx!, lockingScript, { protocolID: TOKEN_PROTOCOL, keyID: '0' })
  return { tokenId: `${res.txid!}_${coin.vout}`, coin }
}

/** Participant: set aside a pledge coin (MASTER §3.2 key, basket `agentcoop`). No OP_RETURN record in Faz 0. */
export async function makePledgeCoin (wallet: WalletInterface, satoshis: number): Promise<Coin> {
  const key: KeyRef = { protocolID: PLEDGE_PROTOCOL, keyID: Utils.toHex(Random(16)) }
  const lockingScript = await p2pkhFor(wallet, key)
  const res = await wallet.createAction({
    description: 'AgentCoop pledge coin',
    outputs: [{
      lockingScript: lockingScript.toHex(),
      satoshis,
      outputDescription: 'pledge coin',
      basket: 'agentcoop',
      customInstructions: JSON.stringify({ ...key, counterparty: 'anyone' })
    }],
    options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
  })
  return coinFrom(res.tx!, lockingScript, key)
}

/** Provider revenue script (MASTER §3.2 provider key). */
export const providerPayScript = async (provider: WalletInterface, poolNonce: string): Promise<LockingScript> =>
  await p2pkhFor(provider, { protocolID: PROVIDER_PROTOCOL, keyID: poolNonce })

export interface SettlementParticipant {
  coin: Coin
  identityKey: string
  credits: bigint
  /** satoshis the participant pays toward the price */
  share: number
  /** satoshis the participant pays toward the mining fee */
  fee: number
}

/**
 * Unsigned settlement, FINAL-IDEA §4.4 layout:
 *   in0 = provider credit UTXO        out0 = priceSats → provider
 *   in1..n = pledge coins             out1..n = BSV-21 transfer → participant receive key #0
 *                                     out n+1..2n = change → each pledge coin's own script
 *                                     out 2n+1 = OP_RETURN agentcoop settle
 */
export function buildSettlement (args: {
  offer: Coin
  tokenId: string
  priceSats: number
  payScript: LockingScript
  participants: SettlementParticipant[]
  poolId: string
}): Transaction {
  const tx = new Transaction()
  tx.addInput({ sourceTransaction: args.offer.sourceTransaction, sourceOutputIndex: args.offer.vout, unlockingScript: new UnlockingScript([]), sequence: 0xffffffff })
  tx.addOutput({ lockingScript: args.payScript, satoshis: args.priceSats })
  for (const p of args.participants) {
    tx.addInput({ sourceTransaction: p.coin.sourceTransaction, sourceOutputIndex: p.coin.vout, unlockingScript: new UnlockingScript([]), sequence: 0xffffffff })
  }
  for (const p of args.participants) {
    tx.addOutput({
      lockingScript: buildBsv21Script({ op: 'transfer', id: args.tokenId, amt: p.credits.toString() }, receivePkh(p.identityKey, 0)),
      satoshis: 1
    })
  }
  for (const p of args.participants) {
    const change = p.coin.satoshis - p.share - p.fee - 1 // 1 sat for the credit output
    if (change < 1) throw new Error('pledge coin too small')
    tx.addOutput({ lockingScript: p.coin.lockingScript, satoshis: change })
  }
  const outpoints = args.participants.map(p => `${p.coin.sourceTransaction.id('hex')}_${p.coin.vout}`).sort()
  tx.addOutput({
    lockingScript: agentcoopOpReturn('settle', {
      v: '1',
      poolId: args.poolId,
      pledgeListHash: Utils.toHex(Hash.sha256(Utils.toArray(outpoints.join(','), 'utf8')))
    }),
    satoshis: 0
  })
  return tx
}

/** Checksig-format signature (DER + sighash byte) for one input, signed by the wallet over the BIP-143 preimage. */
export async function checksigFor (wallet: WalletInterface, tx: Transaction, inputIndex: number, key: KeyRef, scope: number): Promise<number[]> {
  const input = tx.inputs[inputIndex]
  const sourceTx = input.sourceTransaction!
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
  const { signature } = await wallet.createSignature({ hashToDirectlySign: Hash.hash256(preimage), ...key, counterparty: 'anyone' })
  const sig = Signature.fromDER([...signature])
  return new TransactionSignature(sig.r, sig.s, scope).toChecksigFormat()
}

/** kit client/signer.ts signWalletP2pkhInput, with the sighash scope as a parameter. */
export async function signInput (wallet: WalletInterface, tx: Transaction, inputIndex: number, key: KeyRef, scope: number): Promise<UnlockingScript> {
  const checksig = await checksigFor(wallet, tx, inputIndex, key, scope)
  const { publicKey } = await wallet.getPublicKey({ ...key, counterparty: 'anyone', forSelf: true })
  const pub = Utils.toArray(publicKey, 'hex')
  return new UnlockingScript([{ op: checksig.length, data: checksig }, { op: pub.length, data: pub }])
}

/** Run the script interpreter on one input (true = valid). */
export function inputIsValid (tx: Transaction, inputIndex: number): boolean {
  const input = tx.inputs[inputIndex]
  const source = input.sourceTransaction!.outputs[input.sourceOutputIndex]
  try {
    return new Spend({
      sourceTXID: input.sourceTXID ?? input.sourceTransaction!.id('hex'),
      sourceOutputIndex: input.sourceOutputIndex,
      sourceSatoshis: source.satoshis!,
      lockingScript: source.lockingScript,
      transactionVersion: tx.version,
      otherInputs: tx.inputs.filter((_, i) => i !== inputIndex),
      outputs: tx.outputs,
      unlockingScript: input.unlockingScript!,
      inputSequence: input.sequence ?? 0xffffffff,
      inputIndex,
      lockTime: tx.lockTime
    }).validate()
  } catch {
    return false
  }
}

// ── overlay HTTP ──────────────────────────────────────────────────────────

export async function submitToOverlay (overlayUrl: string, beef: number[]): Promise<{ status: number, body: any }> {
  const res = await fetch(`${overlayUrl}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-Topics': JSON.stringify(['tm_agentcoop']) },
    body: new Uint8Array(beef)
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

export async function lookup (overlayUrl: string, query: Record<string, unknown>): Promise<Array<{ txid: string, vout: number, ctx: any }>> {
  const res = await fetch(`${overlayUrl}/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service: 'ls_agentcoop', query })
  })
  const answer = await res.json() as any
  if (!res.ok || answer.type !== 'output-list') throw new Error(`lookup failed: ${JSON.stringify(answer)}`)
  return answer.outputs.map((o: { beef: number[], outputIndex: number, context: number[] }) => ({
    txid: Transaction.fromBEEF(o.beef).id('hex'),
    vout: o.outputIndex,
    ctx: JSON.parse(Utils.toUTF8(o.context))
  }))
}

/** Broadcast on the mock chain (stands in for Arcade; validates every script). */
export async function broadcastMock (services: { postBeef: (beef: any, txids: string[]) => Promise<any[]> }, tx: Transaction): Promise<void> {
  const [result] = await services.postBeef(Beef.fromBinary(tx.toBEEF()), [tx.id('hex')])
  if (result?.status !== 'success') throw new Error(`mock broadcast failed: ${JSON.stringify(result)}`)
}
