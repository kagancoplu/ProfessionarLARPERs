/**
 * RESEARCH ONLY (track A 6.6): a guard-less Mandate Vault prototype. Not exported from
 * @agentcoop/core, never used on mainnet. Report: plan/phases/A-P6-covenant-report.md.
 *
 *   OP_IF   <ownerPub> OP_CHECKSIG                                   owner alone, any time
 *   OP_ELSE covenant (OP_PUSH_TX): the spending transaction must be
 *             one input (this coin) → [ pay ≤ maxPaySats to payScript, change back to THIS script ]
 *             with fee = input − pay − change ≤ maxFeeSats, plus the agent's signature
 *   OP_ENDIF
 *
 * Covenant unlock: <agentSig> <outputs> <preimage> OP_0
 *
 * OP_PUSH_TX: the script recomputes the BIP-143 preimage's signature for private key 1 and
 * nonce 1 (r = Gx, s = z + Gx mod n) and checks it with OP_CHECKSIG against pubkey G. Only the
 * real preimage of this transaction passes, so every field the script then reads from it
 * (hashPrevouts, the coin's value, its own script, hashOutputs) is the truth. The spender
 * grinds the change by a sat until s encodes as a 32-byte low DER integer (≈ 2 tries).
 *
 * Uses Chronicle opcodes (OP_SUBSTR, OP_LEFT, OP_RIGHT) and 33-byte script numbers. @bsv/sdk 3.2.1's
 * interpreter allows both with its default flags; transaction version > 1 only relaxes the
 * malleability rules (LOW_S, MINIMALDATA, CLEANSTACK), which this unlock satisfies anyway (low s by
 * grinding, minimal pushes), so version 1 and 2 both work.
 */
import { BigNumber, ECDSA, Hash, LockingScript, OP, PrivateKey, Script, Transaction, TransactionSignature, UnlockingScript, Utils } from '../../sdk'

const N = new BigNumber('fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141', 16)
const GX = new BigNumber('79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', 16)
const G_PUB = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'
const S_MIN = new BigNumber(1).iushln(248) // 32 bytes, no leading zero
const S_MAX = new BigNumber(1).iushln(255) // top bit clear (DER positive, and low-S)
const SCOPE = TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID

export interface CovenantTerms {
  ownerPub: string
  agentPub: string
  /** The one allowlisted payee script (P2PKH, 25 bytes). */
  payScriptHex: string
  maxPaySats: number
  maxFeeSats: number
}

const reverse32 = (s: Script): Script => {
  for (let i = 0; i < 31; i++) s.writeOpCode(OP.OP_1).writeOpCode(OP.OP_SPLIT)
  for (let i = 0; i < 31; i++) s.writeOpCode(OP.OP_SWAP).writeOpCode(OP.OP_CAT)
  return s
}
const num = (s: Script, n: number | BigNumber): Script => s.writeBn(typeof n === 'number' ? new BigNumber(n) : n)

export function covenantVaultScript (t: CovenantTerms): LockingScript {
  const pay = Utils.toArray(t.payScriptHex, 'hex')
  if (pay.length !== 25) throw new Error('prototype: payScript must be a 25-byte P2PKH')
  const s = new Script()
  const op = (...codes: number[]): Script => { for (const c of codes) s.writeOpCode(c); return s }
  s.writeOpCode(OP.OP_IF).writeBin(Utils.toArray(t.ownerPub, 'hex')).writeOpCode(OP.OP_CHECKSIG)
  s.writeOpCode(OP.OP_ELSE)
  // [sig outs pre]
  // 1. OP_PUSH_TX on a copy of the preimage: sig(k=1, d=1) over it must verify for pubkey G.
  op(OP.OP_DUP, OP.OP_HASH256)
  reverse32(s) // z, little-endian
  s.writeBin([0x00]); op(OP.OP_CAT, OP.OP_BIN2NUM) // as a positive script number
  num(s, GX); op(OP.OP_ADD); num(s, N); op(OP.OP_MOD) // s = z + Gx mod n
  op(OP.OP_DUP); num(s, S_MIN); num(s, S_MAX); op(OP.OP_WITHIN, OP.OP_VERIFY) // 32-byte, low, positive
  num(s, 32); op(OP.OP_NUM2BIN)
  reverse32(s) // s, big-endian
  s.writeBin([0x30, 0x44, 0x02, 0x20, ...GX.toArray('be', 32), 0x02, 0x20]); op(OP.OP_SWAP, OP.OP_CAT)
  s.writeBin([SCOPE]); op(OP.OP_CAT)
  s.writeBin(Utils.toArray(G_PUB, 'hex')); op(OP.OP_CHECKSIGVERIFY)
  // [sig outs pre]  the preimage is now this transaction's
  // 2. One input only: hashPrevouts == hash256(this outpoint), so the fee can only come from this coin.
  op(OP.OP_DUP); num(s, 4); num(s, 32); op(OP.OP_SUBSTR)
  op(OP.OP_OVER); num(s, 68); num(s, 36); op(OP.OP_SUBSTR, OP.OP_HASH256)
  op(OP.OP_EQUALVERIFY)
  // 3. hashOutputs commits to exactly the outputs blob we were given.
  op(OP.OP_2DUP, OP.OP_SIZE); num(s, 40); op(OP.OP_SUB); num(s, 32); op(OP.OP_SUBSTR) // [sig outs pre outs hashOutputs]; tail = value 8, nSequence 4, hashOutputs 32, lockTime 4, type 4
  op(OP.OP_SWAP, OP.OP_HASH256, OP.OP_EQUALVERIFY) // [sig outs pre]
  // 4. This coin's own script (scriptCode, varint included) and value.
  op(OP.OP_DUP, OP.OP_SIZE); num(s, 156); op(OP.OP_SUB); num(s, 104); op(OP.OP_SWAP, OP.OP_SUBSTR) // [sig outs pre sc]
  op(OP.OP_SWAP, OP.OP_SIZE); num(s, 52); op(OP.OP_SUB); num(s, 8); op(OP.OP_SUBSTR, OP.OP_BIN2NUM) // [sig outs sc val]
  // 5. Output 0: 0 < pay ≤ maxPaySats, to the allowlisted script.
  op(OP.OP_2, OP.OP_PICK) // [sig outs sc val outs]
  op(OP.OP_DUP); num(s, 8); op(OP.OP_LEFT, OP.OP_BIN2NUM) // [… outs pay]
  op(OP.OP_DUP); num(s, 0); op(OP.OP_GREATERTHAN, OP.OP_VERIFY)
  op(OP.OP_DUP); num(s, t.maxPaySats); op(OP.OP_LESSTHANOREQUAL, OP.OP_VERIFY)
  op(OP.OP_SWAP) // [… pay outs]
  op(OP.OP_DUP); num(s, 8); num(s, 26); op(OP.OP_SUBSTR)
  s.writeBin([0x19, ...pay]); op(OP.OP_EQUALVERIFY)
  // 6. Output 1 and nothing after it: change back to this very script.
  op(OP.OP_SIZE); num(s, 34); op(OP.OP_SUB); num(s, 34); op(OP.OP_SWAP, OP.OP_SUBSTR) // [sig outs sc val pay change]
  op(OP.OP_DUP, OP.OP_SIZE); num(s, 8); op(OP.OP_SUB); num(s, 8); op(OP.OP_SWAP, OP.OP_SUBSTR) // [… change changeScript]
  op(OP.OP_4, OP.OP_PICK, OP.OP_EQUALVERIFY) // == scriptCode
  num(s, 8); op(OP.OP_LEFT, OP.OP_BIN2NUM) // [sig outs sc val pay chg]
  // 7. fee = val − pay − chg ≤ maxFeeSats  ⇔  val ≤ pay + chg + maxFee
  op(OP.OP_ADD); num(s, t.maxFeeSats); op(OP.OP_ADD, OP.OP_LESSTHANOREQUAL, OP.OP_VERIFY) // [sig outs sc]
  // 8. The agent signs the whole transaction.
  op(OP.OP_2DROP)
  s.writeBin(Utils.toArray(t.agentPub, 'hex')); op(OP.OP_CHECKSIG)
  op(OP.OP_ENDIF)
  return LockingScript.fromHex(s.toHex())
}

// ── spender side ─────────────────────────────────────────────────────────────

const serializeOutput = (o: Transaction['outputs'][number]): number[] => {
  const w = new Utils.Writer()
  w.writeUInt64LEBn(new BigNumber(o.satoshis ?? 0))
  const script = o.lockingScript.toBinary()
  w.writeVarIntNum(script.length)
  w.write(script)
  return w.toArray()
}

export function covenantPreimage (tx: Transaction, inputIndex = 0): number[] {
  const input = tx.inputs[inputIndex]
  const source = input.sourceTransaction!.outputs[input.sourceOutputIndex]
  return TransactionSignature.format({
    sourceTXID: input.sourceTransaction!.id('hex'),
    sourceOutputIndex: input.sourceOutputIndex,
    sourceSatoshis: source.satoshis!,
    transactionVersion: tx.version,
    otherInputs: tx.inputs.filter((_, i) => i !== inputIndex),
    inputIndex,
    outputs: tx.outputs,
    inputSequence: input.sequence ?? 0xffffffff,
    subscript: source.lockingScript,
    lockTime: tx.lockTime,
    scope: SCOPE
  })
}

/** s of the OP_PUSH_TX signature for this preimage, and whether it encodes as the script expects. */
export function pushTxS (preimage: number[]): { s: BigNumber, ok: boolean } {
  const z = new BigNumber(Hash.hash256(preimage))
  const s = z.add(GX).umod(N)
  return { s, ok: s.cmp(S_MIN) >= 0 && s.cmp(S_MAX) < 0 }
}

const checksig = (key: PrivateKey, preimage: number[]): number[] =>
  [...(ECDSA.sign(new BigNumber(Hash.hash256(preimage)), key, true).toDER() as number[]), SCOPE]

/**
 * A covenant spend of `vout`: [pay → payScript, change → same script] (version 1 by default). Grinds the
 * change down 1 sat at a time (into the fee) until the OP_PUSH_TX signature encodes.
 */
export function buildCovenantSpend (args: {
  sourceTx: Transaction
  vout: number
  payScriptHex: string
  paySats: number
  feeSats: number
  agentKey: PrivateKey
  version?: number
  /** Test hook: change the transaction after grinding (the script must then refuse it). */
  tamper?: (tx: Transaction) => void
}): { tx: Transaction, tries: number, outputs: number[], preimage: number[] } {
  const coin = args.sourceTx.outputs[args.vout]
  for (let extra = 0; extra < 64; extra++) {
    const tx = new Transaction(args.version ?? 1)
    tx.addInput({ sourceTransaction: args.sourceTx, sourceOutputIndex: args.vout, sequence: 0xffffffff })
    tx.addOutput({ lockingScript: LockingScript.fromHex(args.payScriptHex), satoshis: args.paySats })
    tx.addOutput({ lockingScript: coin.lockingScript, satoshis: coin.satoshis! - args.paySats - args.feeSats - extra })
    args.tamper?.(tx)
    const preimage = covenantPreimage(tx)
    if (!pushTxS(preimage).ok) continue
    const outputs = tx.outputs.flatMap(serializeOutput)
    const u = new Script().writeBin(checksig(args.agentKey, preimage)).writeBin(outputs).writeBin(preimage).writeOpCode(OP.OP_0)
    tx.inputs[0].unlockingScript = UnlockingScript.fromHex(u.toHex())
    return { tx, tries: extra + 1, outputs, preimage }
  }
  throw new Error('could not grind a usable OP_PUSH_TX signature in 64 tries')
}

/** The owner's branch: <sigOwner> OP_1. */
export function ownerSpend (sourceTx: Transaction, vout: number, toScriptHex: string, feeSats: number, ownerKey: PrivateKey): Transaction {
  const coin = sourceTx.outputs[vout]
  const tx = new Transaction(1)
  tx.addInput({ sourceTransaction: sourceTx, sourceOutputIndex: vout, sequence: 0xffffffff })
  tx.addOutput({ lockingScript: LockingScript.fromHex(toScriptHex), satoshis: coin.satoshis! - feeSats })
  const u = new Script().writeBin(checksig(ownerKey, covenantPreimage(tx))).writeOpCode(OP.OP_1)
  tx.inputs[0].unlockingScript = UnlockingScript.fromHex(u.toHex())
  return tx
}
