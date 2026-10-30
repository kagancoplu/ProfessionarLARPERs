/**
 * D-P2 §9.1: the guard's pledge awareness (2.1b, P1–P6), pool facts read from a
 * pool transaction, and the ledger's reservations, on hand-built transactions.
 * The end-to-end run (real wallets, overlay, coordinator round) is
 * test/e2e.vault-settlement.mockchain.test.ts.
 */
import { describe, expect, it } from 'vitest'
import { BigNumber, ECDSA, KeyDeriver, LockingScript, P2PKH, PrivateKey, Script, Transaction, TransactionSignature, Utils } from '@agentcoop/core/sdk'
import { buildOpReturn, PROVIDER_PROTOCOL, VAULT_PROTOCOL, anyonePkh, type PledgeRecord, type PoolTerms } from '@agentcoop/core'
import { buildBsv21Script } from '@agentcoop/core/kit/inscription'
import { VAULT_SIGHASH, newVaultId, providerPayScript, vaultKeysForRecord, vaultScriptForRecord, vaultSighash, type VaultRecord } from '@agentcoop/core/scripts/vault'
import { evaluateCosign, type GuardPolicy, type RegisteredVault } from '../src/policy'
import { poolFactsFromTx, txFromBytes, type PoolFacts } from '../src/pool'
import { GuardStore, reserveKey } from '../src/store'

const id = (k: PrivateKey): string => k.toPublicKey().toString()
const [owner, agent, guard, provider, rogue] = Array.from({ length: 5 }, () => PrivateKey.fromRandom())
const vaultId = newVaultId()
const record: VaultRecord = { v: '1', vaultId, owner: id(owner), agent: id(agent), guard: id(guard) }
const vaultScript = vaultScriptForRecord(record)
const registered: RegisteredVault = { record, keys: vaultKeysForRecord(record), lockingScriptHex: vaultScript.toHex(), registeredAt: new Date().toISOString() }
const policy: GuardPolicy = { allowProviders: [id(provider)], maxPerPoolSats: 6_000, weeklyCapSats: 20_000, maxFeeSats: 500, hotWalletDailySats: 0 }
const agentVaultKey = new KeyDeriver(agent).derivePrivateKey(VAULT_PROTOCOL, vaultId, 'anyone')
const changeScript = new P2PKH().lock(PrivateKey.fromRandom().toPublicKey().toAddress())
const tokenId = `${'ab'.repeat(32)}_0`

/** A pool transaction in A's layout: out0 offer UTXO (credits on the provider's `offer <nonce>` key), out1 OP_RETURN pool. */
function poolTx (who: PrivateKey, nonce = 'n1', offerKeyOf: PrivateKey = who): { tx: Transaction, terms: PoolTerms } {
  const announced = {
    v: '1', provider: id(who), providerApi: 'http://localhost:8092', tokenId, credits: '1000', priceSats: '10000',
    payScriptHex: providerPayScript(id(who), nonce).toHex(), feeSats: '50', minCredits: '100', deadlineHeight: '1000',
    label: 'test pool', retailSatsPerCredit: '15'
  }
  const tx = new Transaction()
  tx.addInput({ sourceTXID: '33'.repeat(32), sourceOutputIndex: 0, unlockingScript: new Script(), sequence: 0xffffffff })
  tx.addOutput({ lockingScript: buildBsv21Script({ op: 'transfer', id: tokenId, amt: '1000' }, anyonePkh(id(offerKeyOf), `offer ${nonce}`, PROVIDER_PROTOCOL)), satoshis: 1 })
  tx.addOutput({ lockingScript: buildOpReturn('pool', { ...announced, nonce }), satoshis: 0 })
  return { tx, terms: { ...announced, poolId: `${tx.id('hex')}_0` } as PoolTerms }
}

const facts = (who = provider, extra: Partial<PoolFacts> = {}): PoolFacts => {
  const { tx } = poolTx(who)
  const f = poolFactsFromTx(tx, `${tx.id('hex')}_0`)
  return { ...f, lineage: { ok: true, tokenId, amt: 1000n }, ...extra }
}

function sourceTx (lockingScript: LockingScript, satoshis: number, txidByte = '11'): Transaction {
  const t = new Transaction()
  t.addInput({ sourceTXID: txidByte.repeat(32), sourceOutputIndex: 0, unlockingScript: new Script(), sequence: 0xffffffff })
  t.addOutput({ lockingScript, satoshis })
  return t
}

/** vault 20,000 + agent's 5,000 → out0 coin (vault), out1 fee, out2 pledge record, out3 vault change, out4 agent change. */
function pledgeTx (pool: PoolFacts, opts: { coin?: number, coinScript?: LockingScript, record?: Partial<PledgeRecord>, fee?: number, vaultIn?: Transaction } = {}): Transaction {
  const coin = opts.coin ?? 4_301
  const fee = opts.fee ?? 50
  const rec: PledgeRecord = { v: '1', poolId: pool.poolId, credits: '400', participant: id(agent), tokenIndex: '0', signer: 'vault', ...opts.record }
  const tx = new Transaction()
  tx.addInput({ sourceTransaction: opts.vaultIn ?? sourceTx(vaultScript, 20_000), sourceOutputIndex: 0, unlockingScript: new Script(), sequence: 0xffffffff })
  tx.addInput({ sourceTransaction: sourceTx(changeScript, 5_000, '22'), sourceOutputIndex: 0, unlockingScript: new Script(), sequence: 0xffffffff })
  tx.addOutput({ lockingScript: opts.coinScript ?? vaultScript, satoshis: coin })
  tx.addOutput({ lockingScript: LockingScript.fromHex(pool.terms.payScriptHex), satoshis: fee })
  tx.addOutput({ lockingScript: buildOpReturn('pledge', rec), satoshis: 0 })
  tx.addOutput({ lockingScript: vaultScript, satoshis: 20_000 - coin - fee })
  tx.addOutput({ lockingScript: changeScript, satoshis: 4_900 })
  return tx
}

const agentSig = (tx: Transaction, i = 0): string => {
  const sig = ECDSA.sign(new BigNumber(vaultSighash(tx, i)), agentVaultKey, true)
  return Utils.toHex(new TransactionSignature(sig.r, sig.s, VAULT_SIGHASH).toChecksigFormat())
}

function evaluate (tx: Transaction, pledgePool: PoolFacts | { error: string } | undefined, over: Partial<Parameters<typeof evaluateCosign>[0]> = {}): ReturnType<typeof evaluateCosign> {
  return evaluateCosign({
    tx, inputIndex: 0, agent: id(agent), agentSignatureHex: agentSig(tx), context: { kind: 'pay' },
    findVault: s => s === registered.lockingScriptHex ? registered : undefined,
    policyFor: () => policy,
    spentInWindow: () => 0,
    poolSpent: () => 0,
    pledgePool,
    ...over
  })
}
const reasonOf = (r: ReturnType<typeof evaluateCosign>): string => r.ok ? 'ok' : r.reason

describe('pool facts from the pool transaction (S4 / P3)', () => {
  it('terms = record − nonce + poolId; the offer owner and the nonce come along', () => {
    const { tx, terms } = poolTx(provider)
    const f = poolFactsFromTx(tx, terms.poolId)
    expect(f.terms).toEqual(terms)
    expect(f.nonce).toBe('n1')
    expect(f.offerOwnerPkh).toBe(anyonePkh(id(provider), 'offer n1', PROVIDER_PROTOCOL))
    expect(() => poolFactsFromTx(tx, `${'00'.repeat(32)}_0`)).toThrow(/pool transaction is not/)
  })

  it('transport: the pool tx from AtomicBEEF, BEEF or raw bytes, bound to its txid', () => {
    const { tx } = poolTx(provider)
    const txid = tx.id('hex')
    expect(txFromBytes(tx.toBinary(), txid).id('hex')).toBe(txid)
    expect(txFromBytes(Utils.toHex(tx.toBinary()), txid).id('hex')).toBe(txid)
    expect(() => txFromBytes(tx.toBinary(), '00'.repeat(32))).toThrow(/no transaction/)
  })
})

describe('2.1b: a vault pledge is checked at pledge time', () => {
  it('allows a pledge to an allowed pool: out1 is a proven payment, the coin is reserved', () => {
    const pool = facts()
    const r = evaluate(pledgeTx(pool), pool)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r).toMatchObject({ outflowSats: 50, paidSats: 50, pledge: { poolId: pool.poolId, coinSats: 4_301, feeSats: 50, credits: '400' } })
    expect(r.entries).toEqual([
      { outpoint: r.vaultOutpoint, outflowSats: 50, kind: 'pledge', poolId: pool.poolId, poolSats: 50 },
      { outpoint: reserveKey(r.vaultOutpoint), outflowSats: 4_301, kind: 'reserve', poolId: pool.poolId, poolSats: 4_301 }
    ])
  })

  it('P4: a provider outside the allowlist; a pool claiming an allowed provider it does not belong to', () => {
    const roguePool = facts(rogue)
    expect(reasonOf(evaluate(pledgeTx(roguePool), roguePool))).toBe(`provider not allowed: ${id(rogue).slice(0, 10)}…`)
    // the record names `provider`, but the offer UTXO sits on the rogue's offer key
    const { tx } = poolTx(provider, 'n1', rogue)
    const fake = { ...poolFactsFromTx(tx, `${tx.id('hex')}_0`), lineage: { ok: true, tokenId, amt: 1000n } }
    expect(reasonOf(evaluate(pledgeTx(fake), fake))).toBe("offer UTXO is not the provider's")
    // the record names `provider`, but its revenue goes elsewhere
    const pool = facts()
    const misdirected = { ...pool, terms: { ...pool.terms, payScriptHex: providerPayScript(id(rogue), 'n1').toHex() } }
    expect(reasonOf(evaluate(pledgeTx(misdirected), misdirected))).toBe("pool payScript is not the provider's revenue key")
  })

  it('P5: "100% of the budget into the allowed pool" and splitting across pools hit the caps', () => {
    const pool = facts()
    expect(reasonOf(evaluate(pledgeTx(pool, { coin: 10_301, record: { credits: '1000' } }), pool))).toBe('maxPerPoolSats exceeded (pledge 10351 > 6000)')
    expect(reasonOf(evaluate(pledgeTx(pool), pool, { poolSpent: () => 2_000 }))).toBe('maxPerPoolSats exceeded (pledge 2000 + 4351 > 6000)')
    expect(reasonOf(evaluate(pledgeTx(pool), pool, { spentInWindow: () => 16_000 }))).toBe('weeklyCapSats exceeded (16000 + 4351 > 20000)')
  })

  it('P1/P2: layout and record', () => {
    const pool = facts()
    expect(reasonOf(evaluate(pledgeTx(pool, { coinScript: changeScript }), pool))).toBe('pledge layout: out0 pledge coin on this vault, out1 fee, out2 record')
    expect(reasonOf(evaluate(pledgeTx(pool, { record: { participant: id(rogue) } }), pool))).toBe('pledge record does not name this agent')
    expect(reasonOf(evaluate(pledgeTx(pool, { record: { signer: 'p2pkh' } }), pool))).toBe("vault pledge must say signer 'vault'")
    expect(reasonOf(evaluate(pledgeTx(pool, { coin: 3_000 }), pool))).toBe('pledge layout: pledge coin below its share')
    expect(reasonOf(evaluate(pledgeTx(pool, { record: { credits: '50' } }), pool))).toBe('pledge layout: credits outside 100..1000')
  })

  it('P3/P6: no pool transaction, another pool, failed lineage', () => {
    const pool = facts()
    expect(reasonOf(evaluate(pledgeTx(pool), undefined))).toBe('pool transaction not available')
    expect(reasonOf(evaluate(pledgeTx(pool), { error: 'pool transaction not available: 404' }))).toBe('pool transaction not available: 404')
    expect(reasonOf(evaluate(pledgeTx(pool), facts(provider, { poolId: `${'cd'.repeat(32)}_0` })))).toBe('pool mismatch')
    expect(reasonOf(evaluate(pledgeTx(pool), { ...pool, lineage: { ok: false, reason: 'fake credits' } }))).toBe('LINEAGE_FAILED: fake credits')
    expect(reasonOf(evaluate(pledgeTx(pool), { ...pool, lineage: { ok: true, tokenId, amt: 999n } }))).toMatch(/^LINEAGE_FAILED: offer carries 999/)
  })

  it('a spend of the pledge coin resolves its reservation (ledger key)', () => {
    const pool = facts()
    const coinTx = pledgeTx(pool)
    const cancel = new Transaction()
    cancel.addInput({ sourceTransaction: coinTx, sourceOutputIndex: 0, unlockingScript: new Script(), sequence: 0xffffffff })
    cancel.addInput({ sourceTransaction: sourceTx(changeScript, 1_000, '44'), sourceOutputIndex: 0, unlockingScript: new Script(), sequence: 0xffffffff })
    cancel.addOutput({ lockingScript: vaultScript, satoshis: 4_301 })
    cancel.addOutput({ lockingScript: changeScript, satoshis: 950 })
    const r = evaluate(cancel, undefined, { reservationKey: reserveKey(`${'11'.repeat(32)}.0`) })
    expect(r.ok && r.entries).toEqual([{ outpoint: reserveKey(`${'11'.repeat(32)}.0`), outflowSats: 0, kind: 'resolve' }])
  })
})

describe('ledger reservations (D-P2 §4.8)', () => {
  const at = (now: number): string => new Date(now).toISOString()
  const base = { owner: id(owner), agent: id(agent), vaultId }

  it('pledge reserves; the settlement replaces the reservation with its cost; a later resolution keeps the largest', () => {
    const s = new GuardStore()
    const now = Date.now()
    s.recordSpend({ ...base, outpoint: 'a.0', outflowSats: 50, kind: 'pledge', poolId: 'p_0', poolSats: 50, at: at(now) }, now)
    s.recordSpend({ ...base, outpoint: reserveKey('a.0'), outflowSats: 4_301, kind: 'reserve', poolId: 'p_0', poolSats: 4_301, at: at(now) }, now)
    expect(s.spentInWindow(id(owner), id(agent), now)).toBe(4_351)
    expect(s.poolSpent(id(owner), id(agent), 'p_0', now)).toBe(4_351)
    expect(s.findReservation(id(owner), id(agent), ['z.9', 'a.0'], now)).toBe(reserveKey('a.0'))

    s.recordSpend({ ...base, outpoint: reserveKey('a.0'), outflowSats: 4_081, kind: 'settle', poolId: 'p_0', poolSats: 4_081, at: at(now) }, now)
    expect(s.spentInWindow(id(owner), id(agent), now)).toBe(50 + 4_081)
    // a round-2 plan with another fee share: the largest is kept, not the sum
    s.recordSpend({ ...base, outpoint: reserveKey('a.0'), outflowSats: 4_090, kind: 'settle', poolId: 'p_0', poolSats: 4_090, at: at(now) }, now)
    s.recordSpend({ ...base, outpoint: reserveKey('a.0'), outflowSats: 0, kind: 'resolve', at: at(now) }, now)
    expect(s.spentInWindow(id(owner), id(agent), now)).toBe(50 + 4_090)
    expect(s.poolSpent(id(owner), id(agent), 'p_0', now)).toBe(50 + 4_090)
  })

  it('a cancelled pledge frees its reservation; hot top-ups count for 24 h only', () => {
    const s = new GuardStore()
    const now = Date.now()
    s.recordSpend({ ...base, outpoint: reserveKey('b.0'), outflowSats: 4_301, kind: 'reserve', poolId: 'p_1', poolSats: 4_301, at: at(now) }, now)
    s.recordSpend({ ...base, outpoint: reserveKey('b.0'), outflowSats: 0, kind: 'resolve', at: at(now) }, now)
    expect(s.spentInWindow(id(owner), id(agent), now)).toBe(0)
    expect(s.poolSpent(id(owner), id(agent), 'p_1', now)).toBe(0)

    s.recordSpend({ ...base, outpoint: 'h.0', outflowSats: 1_500, kind: 'pay', hotSats: 1_500, at: at(now - 25 * 3600_000) }, now)
    s.recordSpend({ ...base, outpoint: 'h.1', outflowSats: 700, kind: 'pay', hotSats: 700, at: at(now) }, now)
    expect(s.hotSpent(id(owner), id(agent), now)).toBe(700)
    expect(s.spentInWindow(id(owner), id(agent), now)).toBe(2_200)
  })
})
