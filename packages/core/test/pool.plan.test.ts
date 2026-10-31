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
import { creditsCost, termsHash } from '../src/pool/terms'
import { decodeBsv21Owned } from '../src/scripts/creditLock'
import { PLEDGE_PROTOCOL, PROVIDER_PROTOCOL, SIGHASH_SINGLE_ACP_FORKID, type Offer, type PoolTerms, type SettlementPlan } from '../src/types'

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

/**
 * One tampering per check in verifySettlementPlan (docs/AUDIT-READINESS.md I-2, mutation testing in §4):
 * each case must fail with the message of the check it targets, so a check that is removed or weakened
 * turns this test red. The plan is a(700) + b(300): inputs offer, a, b; outputs provider, credits a,
 * credits b, change a, change b, settle.
 */
describe('verifySettlementPlan: every check', () => {
  const setup = async (credits: [string, string] = ['700', '300']): Promise<{ offer: Offer, plan: SettlementPlan, a: PledgeCandidate, b: PledgeCandidate }> => {
    const { offer, offerSourceTx } = await makeOffer()
    const [a, b] = [await pledge(offer.terms, credits[0], 10_000, 1), await pledge(offer.terms, credits[1], 10_000, 2)]
    return { offer, plan: planSettlement(offer, [a, b], chainOf(offerSourceTx)), a, b }
  }
  const withTx = (plan: SettlementPlan, f: (tx: Transaction) => void): SettlementPlan => { const tx = planTransaction(plan); f(tx); return { ...plan, templateBEEF: tx.toAtomicBEEF() } }
  const withP = (plan: SettlementPlan, j: number, patch: Partial<SettlementPlan['participants'][number]>): SettlementPlan =>
    ({ ...plan, participants: plan.participants.map((p, i) => i === j ? { ...p, ...patch } : p) })
  const mine = { expectedCredits: '700' }

  it('the honest plan passes, also with my expected credit address', async () => {
    const { offer, plan, a } = await setup()
    const d = decodeBsv21Owned(planTransaction(plan).outputs[1].lockingScript)!
    await verifySettlementPlan(plan, offer, a.outpoint, { ...mine, expectedCreditPkh: d.owner.kind === 'p2pkh' ? d.owner.pkh : '' })
  })

  it('shape: pool id, participants, input and output counts, lighthouse order', async () => {
    const { offer, plan, a } = await setup()
    await expect(verifySettlementPlan({ ...plan, poolId: `${'ee'.repeat(32)}_0` }, offer, a.outpoint, mine)).rejects.toThrow(/pool id mismatch/)
    await expect(verifySettlementPlan({ ...plan, participants: [] }, offer, a.outpoint, mine)).rejects.toThrow(/no participants/)
    await expect(verifySettlementPlan(withTx(plan, tx => { tx.addInput({ ...tx.inputs[1] }) }), offer, a.outpoint, mine)).rejects.toThrow(/expected 3 inputs/)
    await expect(verifySettlementPlan(withTx(plan, tx => { tx.addOutput({ lockingScript: tx.outputs[3].lockingScript, satoshis: 1 }) }), offer, a.outpoint, mine)).rejects.toThrow(/expected 6 outputs/)
    await expect(verifySettlementPlan(withP(plan, 0, { mode: 'lighthouse' }), offer, a.outpoint, mine)).rejects.toThrow(/lighthouse participants must come after/)
  })

  it('offer: input 0, its signature, the provider payment, its N credits', async () => {
    const { offer, plan, a } = await setup()
    await expect(verifySettlementPlan(withTx(plan, tx => { tx.inputs[0].sourceOutputIndex = 1 }), offer, a.outpoint, mine)).rejects.toThrow(/input 0 is not the offer/)
    await expect(verifySettlementPlan(withTx(plan, tx => { tx.inputs[0].unlockingScript = new UnlockingScript() }), offer, a.outpoint, mine)).rejects.toThrow(/does not carry the offer signature/)
    await expect(verifySettlementPlan(plan, { ...offer, unlockingScriptHex: '00' }, a.outpoint, mine)).rejects.toThrow(/does not carry the offer signature/)
    // the tx and the offer agree on an unlocking script that is not a valid signature: only the script check catches it
    const forged = UnlockingScript.fromHex(offer.unlockingScriptHex.replace(/(..)$/, (_m, b: string) => ((parseInt(b, 16) ^ 1).toString(16).padStart(2, '0'))))
    await expect(verifySettlementPlan(withTx(plan, tx => { tx.inputs[0].unlockingScript = forged }), { ...offer, unlockingScriptHex: forged.toHex() }, a.outpoint, mine)).rejects.toThrow(/offer signature does not verify/)
    // the offer signature (SINGLE|ACP) still verifies: only the terms say what output 0 must pay
    await expect(verifySettlementPlan(plan, { ...offer, terms: { ...offer.terms, priceSats: '9999' } }, a.outpoint, mine)).rejects.toThrow(/output 0 is not the provider payment/)
    await expect(verifySettlementPlan(plan, { ...offer, terms: { ...offer.terms, payScriptHex: '51' } }, a.outpoint, mine)).rejects.toThrow(/output 0 is not the provider payment/)
    await expect(verifySettlementPlan(plan, { ...offer, terms: { ...offer.terms, credits: '999' } }, a.outpoint, mine)).rejects.toThrow(/does not carry N credits/)
  })

  it('participants: inputs in plan order, credit outputs (amount, token, 1 sat), creditLock and mode from the pledge record', async () => {
    const { offer, plan, a } = await setup()
    await expect(verifySettlementPlan(withTx(plan, tx => { const [x, y] = [tx.inputs[1], tx.inputs[2]]; tx.inputs[1] = y; tx.inputs[2] = x }), offer, a.outpoint, mine)).rejects.toThrow(/input 1 is not/)
    const credit = (amt: string, id = offer.terms.tokenId): LockingScript => buildBsv21Script({ op: 'transfer', id, amt }, '00'.repeat(20))
    await expect(verifySettlementPlan(withTx(plan, tx => { tx.outputs[2].lockingScript = credit('299') }), offer, a.outpoint, mine)).rejects.toThrow(/output 2 is not 300 credits/)
    await expect(verifySettlementPlan(withTx(plan, tx => { tx.outputs[2].lockingScript = credit('300', `${'cd'.repeat(32)}_0`) }), offer, a.outpoint, mine)).rejects.toThrow(/output 2 is not 300 credits/)
    await expect(verifySettlementPlan(withTx(plan, tx => { tx.outputs[2].satoshis = 2 }), offer, a.outpoint, mine)).rejects.toThrow(/output 2 is not 300 credits/)
    await expect(verifySettlementPlan(withTx(plan, tx => { tx.outputs[2].lockingScript = tx.outputs[3].lockingScript }), offer, a.outpoint, mine)).rejects.toThrow(/output 2 is not 300 credits/)
    await expect(verifySettlementPlan(withP(plan, 1, { creditLock: 'vault' }), offer, a.outpoint, mine)).rejects.toThrow(/creditLock ≠ its pledge record/)
    // b claims to be a lighthouse pledge (and the tx drops its change so the counts fit)
    await expect(verifySettlementPlan(withTx(withP(plan, 1, { mode: 'lighthouse', changeSats: '0' }), tx => { tx.outputs.splice(4, 1) }), offer, a.outpoint, mine)).rejects.toThrow(/mode ≠ its pledge record/)
  })

  it('I-2 change: back to the pledge coin script, exactly the plan amount, at least 1 sat, my cost capped', async () => {
    const { offer, plan, a } = await setup()
    const elsewhere = new P2PKH().lock(Utils.toArray('00'.repeat(20), 'hex'))
    // my change, or another participant's (everyone checks every change, not only their own)
    await expect(verifySettlementPlan(withTx(plan, tx => { tx.outputs[3].lockingScript = elsewhere }), offer, a.outpoint, mine)).rejects.toThrow(/change 3 does not return to the pledge coin's script/)
    await expect(verifySettlementPlan(withTx(plan, tx => { tx.outputs[4].lockingScript = elsewhere }), offer, a.outpoint, mine)).rejects.toThrow(/change 4 does not return to the pledge coin's script/)
    await expect(verifySettlementPlan(withTx(plan, tx => { tx.outputs[3].lockingScript = tx.outputs[4].lockingScript }), offer, a.outpoint, mine)).rejects.toThrow(/change 3 does not return/)
    await expect(verifySettlementPlan(withTx(plan, tx => { tx.outputs[3].satoshis! -= 1 }), offer, a.outpoint, mine)).rejects.toThrow(/change 3 ≠ plan/)
    await expect(verifySettlementPlan(withTx(plan, tx => { tx.outputs[4].satoshis! += 1 }), offer, a.outpoint, mine)).rejects.toThrow(/change 4 ≠ plan/)
    // plan and tx agree on a zero change: still refused (the change output must exist and carry sats)
    await expect(verifySettlementPlan(withTx(withP(plan, 1, { changeSats: '0' }), tx => { tx.outputs[4].satoshis = 0 }), offer, a.outpoint, mine)).rejects.toThrow(/change 4 ≠ plan/)
    // plan and tx agree on taking more from me than the terms and my fee allowance: the cost cap catches it
    const honestCost = 10_000 - Number(plan.participants[0].changeSats)
    const cap = Number(creditsCost(offer.terms, '700')) + 1 + 1000
    const less = String(Number(plan.participants[0].changeSats) - (cap - honestCost + 1))
    expect(Number(less)).toBeGreaterThan(0)
    const greedy = withTx(withP(plan, 0, { changeSats: less }), tx => { tx.outputs[3].satoshis = Number(less) })
    await expect(verifySettlementPlan(greedy, offer, a.outpoint, mine)).rejects.toThrow(`I would pay ${cap + 1} sats, at most ${cap} accepted`)
    await expect(verifySettlementPlan(greedy, offer, a.outpoint, { ...mine, maxFeeSats: 1001 })).resolves.toBeUndefined()
  })

  it('mine: my credits, my credit address, my pledge in the plan', async () => {
    const { offer, plan, a } = await setup()
    await expect(verifySettlementPlan(plan, offer, a.outpoint, { expectedCredits: '300' })).rejects.toThrow(/my credits are 700/)
    await expect(verifySettlementPlan(plan, offer, a.outpoint, { ...mine, expectedCreditPkh: '11'.repeat(20) })).rejects.toThrow(/my credit output pays someone else/)
    await expect(verifySettlementPlan(plan, offer, `${'cd'.repeat(32)}_0`, mine)).rejects.toThrow(/not in the plan/)
  })

  it('totals: the credits sum to N, no pledge twice', async () => {
    const { offer, plan, a } = await setup()
    await expect(verifySettlementPlan(withTx(withP(plan, 1, { credits: '200' }), tx => { tx.outputs[2].lockingScript = buildBsv21Script({ op: 'transfer', id: offer.terms.tokenId, amt: '200' }, '00'.repeat(20)) }), offer, a.outpoint, mine)).rejects.toThrow(/credits sum to 900/)
    // a(500) twice: every per-participant check passes and the sum is N
    const two = await setup(['500', '500'])
    const dup = withTx({ ...two.plan, participants: [two.plan.participants[0], two.plan.participants[0]] }, tx => {
      tx.inputs[2] = { ...tx.inputs[1] }
      tx.outputs[2] = { ...tx.outputs[1] }
      tx.outputs[4] = { ...tx.outputs[3] }
    })
    await expect(verifySettlementPlan(dup, two.offer, two.a.outpoint, { expectedCredits: '500' })).rejects.toThrow(/duplicate pledge/)
  })

  it('settle record: present, this pledge list, these terms and round', async () => {
    const { offer, plan, a } = await setup()
    const settle = (patch: Record<string, string>): LockingScript => buildOpReturn('settle', { v: '1', poolId: offer.terms.poolId, termsHash: termsHash(offer.terms), pledgeListHash: plan.pledgeListHash, round: String(plan.round), ...patch })
    await expect(verifySettlementPlan(withTx(plan, tx => { tx.outputs[5].lockingScript = new P2PKH().lock(Utils.toArray('00'.repeat(20), 'hex')) }), offer, a.outpoint, mine)).rejects.toThrow(/not an agentcoop settle record/)
    await expect(verifySettlementPlan(withTx(plan, tx => { tx.outputs[5].lockingScript = settle({}) }), offer, a.outpoint, mine)).resolves.toBeUndefined()
    await expect(verifySettlementPlan(withTx(plan, tx => { tx.outputs[5].lockingScript = settle({ pledgeListHash: '00'.repeat(32) }) }), offer, a.outpoint, mine)).rejects.toThrow(/pledge-list hash mismatch/)
    await expect(verifySettlementPlan({ ...plan, pledgeListHash: '00'.repeat(32) }, offer, a.outpoint, mine)).rejects.toThrow(/pledge-list hash mismatch/)
    await expect(verifySettlementPlan(withTx(plan, tx => { tx.outputs[5].lockingScript = settle({ poolId: `${'ee'.repeat(32)}_0` }) }), offer, a.outpoint, mine)).rejects.toThrow(/settle record does not match the pool/)
    await expect(verifySettlementPlan(withTx(plan, tx => { tx.outputs[5].lockingScript = settle({ termsHash: '00'.repeat(32) }) }), offer, a.outpoint, mine)).rejects.toThrow(/settle record does not match the pool/)
    await expect(verifySettlementPlan(withTx(plan, tx => { tx.outputs[5].lockingScript = settle({ round: '2' }) }), offer, a.outpoint, mine)).rejects.toThrow(/settle record does not match the pool/)
  })
})

