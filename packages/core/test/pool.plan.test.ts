/**
 * planSettlement / verifySettlementPlan edge cases, without a chain: the offer
 * and pledges are hand-built transactions signed by ProtoWallets.
 */
import { describe, expect, it } from 'vitest'
import { LockingScript, P2PKH, PrivateKey, ProtoWallet, PublicKey, Transaction, UnlockingScript, Utils } from '../src/sdk'
import { buildBsv21Script } from '../src/kit/inscription'
import { buildOpReturn } from '../src/scripts/opreturn'
import { signP2pkhWithScope } from '../src/signers/sighash'
import { offerSkeleton, verifyOffer } from '../src/pool/offer'
import { orderPledges, pledgeListHash, planSettlement, type PledgeCandidate } from '../src/pool/plan'
import { planTransaction, verifySettlementPlan } from '../src/pool/verify'
import { PLEDGE_PROTOCOL, PROVIDER_PROTOCOL, SIGHASH_SINGLE_ACP_FORKID, type Offer, type PoolTerms } from '../src/types'

const coinbase = (lockingScript: LockingScript, satoshis: number): Transaction => {
  const tx = new Transaction()
  tx.addInput({ sourceTXID: PrivateKey.fromRandom().toHex(), sourceOutputIndex: 0, unlockingScript: new UnlockingScript(), sequence: 0xffffffff })
  tx.addOutput({ lockingScript, satoshis })
  return tx
}
const pkhOf = async (w: ProtoWallet, protocolID: any, keyID: string): Promise<string> =>
  PublicKey.fromString((await w.getPublicKey({ protocolID, keyID, counterparty: 'anyone', forSelf: true })).publicKey).toHash('hex') as string

async function makeOffer (credits = '1000', priceSats = '10000'): Promise<{ offer: Offer, offerSourceTx: Transaction }> {
  const provider = new ProtoWallet(PrivateKey.fromRandom())
  const tokenId = `${'ab'.repeat(32)}_0`
  const offerSourceTx = coinbase(buildBsv21Script({ op: 'transfer', id: tokenId, amt: credits }, await pkhOf(provider, PROVIDER_PROTOCOL, 'offer x')), 1)
  const { publicKey } = await provider.getPublicKey({ identityKey: true })
  const terms: PoolTerms = {
    v: '1', poolId: `${offerSourceTx.id('hex')}_0`, provider: publicKey, providerApi: 'http://x', tokenId, credits, priceSats,
    payScriptHex: new P2PKH().lock(Utils.toArray(await pkhOf(provider, PROVIDER_PROTOCOL, 'x'), 'hex')).toHex(), feeSats: '50', minCredits: '100',
    deadlineHeight: '1000', label: 'test', retailSatsPerCredit: '15'
  }
  const unlock = await signP2pkhWithScope(provider, offerSkeleton(offerSourceTx, 0, terms), 0, { protocolID: PROVIDER_PROTOCOL, keyID: 'offer x' }, SIGHASH_SINGLE_ACP_FORKID)
  return { offer: { poolId: terms.poolId, unlockingScriptHex: unlock.toHex(), lockingScriptHex: offerSourceTx.outputs[0].lockingScript.toHex(), satoshis: 1, terms }, offerSourceTx }
}

async function pledge (terms: PoolTerms, credits: string, satoshis: number, blockHeight?: number): Promise<PledgeCandidate> {
  const w = new ProtoWallet(PrivateKey.fromRandom())
  const { publicKey: participant } = await w.getPublicKey({ identityKey: true })
  const lockingScript = new P2PKH().lock(Utils.toArray(await pkhOf(w, PLEDGE_PROTOCOL, 'k'), 'hex'))
  const record = { v: '1' as const, poolId: terms.poolId, credits, participant, tokenIndex: '0', signer: 'p2pkh' as const }
  const sourceTx = coinbase(lockingScript, satoshis)
  sourceTx.addOutput({ lockingScript: buildOpReturn('pledge', record), satoshis: 0 })
  return { outpoint: `${sourceTx.id('hex')}_0`, satoshis, lockingScriptHex: lockingScript.toHex(), record, sourceTx, blockHeight }
}

const chainOf = (offerSourceTx: Transaction, height = 900): { height: number, satsPerKb: number, offerSourceTx: Transaction } => ({ height, satsPerKb: 100, offerSourceTx })

describe('planSettlement', () => {
  it('is deterministic: input order does not change the plan', async () => {
    const { offer, offerSourceTx } = await makeOffer()
    const ps = [await pledge(offer.terms, '500', 6000, 10), await pledge(offer.terms, '300', 4000), await pledge(offer.terms, '200', 3000, 5)]
    const a = planSettlement(offer, ps, chainOf(offerSourceTx))
    const b = planSettlement(offer, [...ps].reverse(), chainOf(offerSourceTx))
    expect(a.templateBEEF).toEqual(b.templateBEEF)
    expect(a.participants.map(p => p.outpoint)).toEqual(orderPledges(ps).map(p => p.outpoint)) // mined (5, 10) first, unmined last
    expect(a.pledgeListHash).toBe(pledgeListHash(ps.map(p => p.outpoint)))
  })

  it('takes exactly N in rule order, skipping a pledge that would overshoot', async () => {
    const { offer, offerSourceTx } = await makeOffer()
    const ps = [await pledge(offer.terms, '900', 10000, 1), await pledge(offer.terms, '200', 3000, 2), await pledge(offer.terms, '100', 2000, 3)]
    const plan = planSettlement(offer, ps, chainOf(offerSourceTx))
    expect(plan.participants.map(p => p.credits)).toEqual(['900', '100'])
    const tx = planTransaction(plan)
    expect(tx.outputs[0].satoshis).toBe(10000)
    const fee = tx.inputs.reduce((s, i) => s + i.sourceTransaction!.outputs[i.sourceOutputIndex].satoshis!, 0) - tx.outputs.reduce((s, o) => s + o.satoshis!, 0)
    expect(fee).toBeGreaterThan(0)
  })

  it('finds an exact fill the first 120% window missed (B blocker: 300, 300, 600, 400)', async () => {
    const { offer, offerSourceTx } = await makeOffer()
    const [a, b, c, d] = [await pledge(offer.terms, '300', 4000, 1), await pledge(offer.terms, '300', 4000, 2), await pledge(offer.terms, '600', 7000, 3), await pledge(offer.terms, '400', 5000, 4)]
    // Window 300 + 300 + 600 = 1200 had no exact 1000; the earliest-first fill is 300 + 300 + 400.
    expect(planSettlement(offer, [a, b, c, d], chainOf(offerSourceTx)).participants.map(p => p.outpoint)).toEqual([a.outpoint, b.outpoint, d.outpoint])
    // When the earliest pledge cannot be part of any fill, it is passed over: 300, 600, 400 → 600 + 400.
    expect(planSettlement(offer, [a, c, d], chainOf(offerSourceTx)).participants.map(p => p.outpoint)).toEqual([c.outpoint, d.outpoint])
  })

  it('keeps later pledges as the waitlist, skips blacklisted ones and under-funded coins', async () => {
    const { offer, offerSourceTx } = await makeOffer()
    const early = await pledge(offer.terms, '1000', 12000, 1)
    const cappedOut = await pledge(offer.terms, '1000', 12000, 2) // waitlisted: the first pledge already fills N
    expect(planSettlement(offer, [early, cappedOut], chainOf(offerSourceTx)).participants.map(p => p.outpoint)).toEqual([early.outpoint])
    // Blacklisting the first pledge lets the waitlisted one take its place (griefing rule, FINAL-IDEA §4.5).
    expect(planSettlement(offer, [early, cappedOut], chainOf(offerSourceTx), { exclude: [early.outpoint], round: 2 }).participants.map(p => p.outpoint)).toEqual([cappedOut.outpoint])
    expect(() => planSettlement(offer, [early, cappedOut], chainOf(offerSourceTx), { exclude: [early.outpoint, cappedOut.outpoint] })).toThrow(/cannot fill/)
    const poor = await pledge(offer.terms, '1000', 10001, 0) // covers the share + 1 but not the fee
    expect(planSettlement(offer, [poor, early], chainOf(offerSourceTx)).participants.map(p => p.outpoint)).toEqual([early.outpoint])
  })

  it('refuses after the deadline and below minCredits', async () => {
    const { offer, offerSourceTx } = await makeOffer()
    const full = await pledge(offer.terms, '1000', 12000)
    const tiny = await pledge(offer.terms, '50', 1000)
    expect(() => planSettlement(offer, [full], chainOf(offerSourceTx, 1001))).toThrow(/DEADLINE_PASSED/)
    expect(() => planSettlement(offer, [tiny], chainOf(offerSourceTx))).toThrow(/cannot fill/)
  })
})

describe('verifySettlementPlan / verifyOffer', () => {
  it('passes an honest plan and catches each kind of tampering', async () => {
    const { offer, offerSourceTx } = await makeOffer()
    expect(() => verifyOffer(offer, { sourceTx: offerSourceTx })).not.toThrow()
    const [a, b] = [await pledge(offer.terms, '700', 8000, 1), await pledge(offer.terms, '300', 4000, 2)]
    const plan = planSettlement(offer, [a, b], chainOf(offerSourceTx))
    await verifySettlementPlan(plan, offer, a.outpoint, { expectedCredits: '700' })
    await expect(verifySettlementPlan(plan, offer, a.outpoint, { expectedCredits: '600' })).rejects.toThrow(/my credits/)
    await expect(verifySettlementPlan(plan, offer, a.outpoint, { expectedCredits: '700', maxFeeSats: 0 })).rejects.toThrow(/at most/)

    const tamper = (f: (tx: Transaction) => void): typeof plan => { const tx = planTransaction(plan); f(tx); return { ...plan, templateBEEF: tx.toAtomicBEEF() } }
    await expect(verifySettlementPlan(tamper(tx => { tx.outputs[0].satoshis = 9000 }), offer, a.outpoint, { expectedCredits: '700' })).rejects.toThrow(/offer signature|provider payment/)
    await expect(verifySettlementPlan(tamper(tx => { tx.outputs[1].lockingScript = buildBsv21Script({ op: 'transfer', id: offer.terms.tokenId, amt: '701' }, '00'.repeat(20)) }), offer, a.outpoint, { expectedCredits: '700' })).rejects.toThrow(/BAD_PLAN/)
    await expect(verifySettlementPlan(tamper(tx => { tx.outputs[5].lockingScript = buildOpReturn('settle', { v: '1', poolId: offer.terms.poolId, termsHash: 'x', pledgeListHash: plan.pledgeListHash, round: '1' }) }), offer, a.outpoint, { expectedCredits: '700' })).rejects.toThrow(/settle record/)
    await expect(verifySettlementPlan({ ...plan, pledgeListHash: '00' }, offer, a.outpoint, { expectedCredits: '700' })).rejects.toThrow(/hash mismatch/)
    await expect(verifySettlementPlan(plan, offer, `${'cd'.repeat(32)}_0`, { expectedCredits: '700' })).rejects.toThrow(/not in the plan/)
  })
})
