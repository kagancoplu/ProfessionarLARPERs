/**
 * Track A 5.3, offline: a vault agent asks (on chain, in its pledge record) for
 * its credits to settle onto the vault script. One settlement: a P2PKH agent's
 * 600 credits to its receive address, the vault agent's 400 locked to its
 * vault. The guard co-signs after its own DvP check. Afterwards the agent alone
 * cannot move the credits (FINAL-IDEA §8, "sells its credits and bypasses the
 * guard"); the owner can. A coordinator that flips the lock either way is refused.
 *
 * The plan is built and signed directly (no coordinator), like the skeleton.
 * The rules' ownerKinds flag and verifyLineage are checked directly; Track B's
 * overlay runs ownerKinds ['p2pkh','vault'] since B-A5. Last: V lists its
 * remaining vault-locked credits (agent + guard SINGLE|ACP, proceeds to the
 * vault; D's guard 'list') and P sweeps them through the overlay.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AuthFetch, LockingScript, Transaction, UnlockingScript, Utils } from '@agentcoop/core/sdk'
import type { Wallet } from '@bsv/wallet-toolbox'
import {
  COOP_SERVICE, COOP_TOPIC, OverlayClient, P2pkhWalletSigner, TokenKit, VAULT_PROTOCOL,
  assembleSettlement, buildBsv21Script, buildPledge, buildReserveAndAnnounce, decodeBsv21Owned, identifyAdmissible, inputScriptValid, internalizeSettlement,
  parseOutpoint, planSettlement, receivePkh, signOffer, signSettlementInput, toChecksigSignature, vaultCosignUnlock, vaultOwnerUnlock,
  vaultSighash, verifyLineage, verifySettlementPlan, VAULT_COSIGN_UNLOCK_LENGTH, internalizeVaultCredits, listVaultCredits, transferVaultCredits,
  buildSweep, signVaultCreditListing, verifyListing,
  type Offer, type PledgeCandidate, type PoolTerms, type SettlementPlan
} from '@agentcoop/core'
import { VaultOwnerSigner, VaultSigner, adoptVaultOutput, httpCosigner, listVaultUtxos, CosignRejected, type Cosigner, type VaultPledge } from '@agentcoop/core/signers/VaultSigner'
import { startOverlay, type RunningOverlay } from '../packages/overlay/src/server'
import { Guard } from '../apps/guard/src/guard'
import { createGuardApp } from '../apps/guard/src/server'
import { createVault, fundVault, putPolicy, registerVault, type VaultInfo } from '../apps/owner-cli/src/vault-ops'
import { OverlayLookup } from '../apps/coordinator/src/overlay'
import { verifyListing as coordinatorVerifyListing } from '../apps/coordinator/src/verifyListing'
import { createMockChain, type MockChain } from './helpers/mockchain'

let chain: MockChain
let overlay: RunningOverlay
let guardServer: Server
let cosign: Cosigner
const VAULT_RULES = { ownerKinds: ['p2pkh', 'vault'] as const }

const fetchTx = async (txid: string): Promise<Transaction> =>
  Transaction.fromBinary(Array.from((await (chain.services as any).storage.getTransaction(txid)).rawTx as number[]))
const kitFor = (w: Wallet): TokenKit => new TokenKit(w, new OverlayClient(overlay.url, undefined, 'main', undefined, COOP_TOPIC, COOP_SERVICE))

beforeAll(async () => {
  chain = await createMockChain()
  overlay = await startOverlay({ port: 18793, dbFile: join(mkdtempSync(join(tmpdir(), 'agentcoop-vcred-')), 'overlay.db'), chainTracker: chain.chainTracker, quiet: true })
}, 60_000)
afterAll(async () => { guardServer?.close(); await overlay?.close(); await chain?.close() })

describe('vault-locked credits in a settlement (A 5.3)', () => {
  let provider: Wallet, agentP: Wallet, agentV: Wallet, owner: Wallet, guardWallet: Wallet
  let kitP: TokenKit, kitA: TokenKit, kitV: TokenKit
  let terms: PoolTerms
  let offer: Offer
  let offerSourceTx: Transaction
  let vault: VaultInfo
  let pPledge: Awaited<ReturnType<typeof buildPledge>>
  let vPledge: VaultPledge
  let plan: SettlementPlan
  let settlement: Transaction
  let j: number // V's participant index; its input is 1 + j, its credit output 1 + j
  let guardUrl: string
  const policy = { maxPerPoolSats: 6_000, weeklyCapSats: 20_000, maxFeeSats: 500, hotWalletDailySats: 0 }

  const candidates = (): PledgeCandidate[] => [pPledge, vPledge].map(p => {
    const sourceTx = Transaction.fromAtomicBEEF(p.beef)
    const vault = p.record.signer === 'vault'
    return {
      outpoint: p.outpoint, satoshis: p.satoshis, record: p.record, sourceTx,
      lockingScriptHex: sourceTx.outputs[parseOutpoint(p.outpoint).vout].lockingScript.toHex(),
      ...(vault ? { unlockingScriptLength: VAULT_COSIGN_UNLOCK_LENGTH } : {})
    }
  })
  const chainInfo = async () => ({ height: await chain.services.getHeight(), satsPerKb: 100, offerSourceTx })
  const verifyAs = async (p: typeof pPledge | VaultPledge, w: Wallet, pl: SettlementPlan): Promise<void> =>
    await verifySettlementPlan(pl, offer, p.outpoint, {
      expectedCredits: p.record.credits,
      expectedCreditPkh: receivePkh((await w.getPublicKey({ identityKey: true })).publicKey, Number(p.record.tokenIndex)),
      verifyLineage: true,
      lineage: { fetchTx }
    })
  const vaultSigner = (pl: SettlementPlan): VaultSigner =>
    new VaultSigner(agentV, { vaultId: vault.record.vaultId, cosign, plan: pl, context: { kind: 'settle', poolId: terms.poolId, expectedCredits: '400', tokenId: terms.tokenId } })

  it('setup: a pool of 1,000 credits, a funded vault for agent V, the guard', async () => {
    ;[provider, agentP, agentV, owner, guardWallet] = await Promise.all(Array.from({ length: 5 }, async () => await chain.makeWallet()))
    for (const w of [provider, agentP, agentV]) await chain.fund(w)
    await chain.fund(owner, 100_000)
    ;[kitP, kitA, kitV] = [kitFor(provider), kitFor(agentP), kitFor(agentV)]

    const height = await chain.services.getHeight()
    const { tokenId } = await kitP.deploy({ sym: 'VCRED', amt: 1000n, dec: 0 })
    const reserved = await buildReserveAndAnnounce(provider, kitP, {
      v: '1', providerApi: 'http://localhost:8092', tokenId, credits: '1000', priceSats: '10000', feeSats: '50',
      minCredits: '100', deadlineHeight: String(height + 144), label: 'vault credits', retailSatsPerCredit: '15'
    })
    terms = reserved.terms
    offerSourceTx = Transaction.fromAtomicBEEF(reserved.beef)
    offer = await signOffer(provider, terms.poolId, terms)

    const guard = await Guard.create({ wallet: guardWallet, fetchTx, log: () => {} })
    guardServer = createGuardApp(guard, guardWallet).listen(0)
    guardUrl = `http://127.0.0.1:${(guardServer.address() as AddressInfo).port}`
    cosign = httpCosigner(guardUrl)
    vault = await createVault(owner, { agent: agentV.identityKey, guard: guardWallet.identityKey })
    await registerVault(new AuthFetch(owner), guardUrl, vault)
    await putPolicy(new AuthFetch(owner), guardUrl, agentV.identityKey, { allowProviders: [provider.identityKey], ...policy })
    const f = await fundVault(owner, vault, 20_000)
    await adoptVaultOutput(agentV, vault.record.vaultId, f.tx, f.vout)
  })

  it('pledges: P agent 600 (P2PKH credits), V 400 from the vault with creditLock "vault" in its record', async () => {
    pPledge = await buildPledge(agentP, terms, '600', 'p2pkh', undefined, { tokenIndex: await kitA.nextIndex(agentP.identityKey) })
    vPledge = await buildPledge(agentV, terms, '400', 'vault', LockingScript.fromHex(vault.lockingScriptHex), {
      tokenIndex: await kitV.nextIndex(agentV.identityKey),
      vault: { vaultId: vault.record.vaultId, utxo: (await listVaultUtxos(agentV, vault.record.vaultId))[0], cosign, creditLock: 'vault' }
    })
    expect(vPledge.record).toMatchObject({ signer: 'vault', creditLock: 'vault' })
    expect(pPledge.record.creditLock).toBeUndefined()
    for (const p of [pPledge, vPledge]) await kitA.overlay.submit(p.beef)
  })

  it('plan: V\'s credit output is the BSV-21 inscription on its own vault script; P\'s stays P2PKH', async () => {
    plan = planSettlement(offer, candidates(), await chainInfo())
    j = plan.participants.findIndex(p => p.outpoint === vPledge.outpoint)
    const tx = Transaction.fromAtomicBEEF(plan.templateBEEF)
    expect(plan.participants[j]).toMatchObject({ signer: 'vault', creditLock: 'vault', credits: '400' })
    expect(decodeBsv21Owned(tx.outputs[1 + j].lockingScript)).toMatchObject({ amount: 400n, owner: { kind: 'vault', vaultScriptHex: vault.lockingScriptHex } })
    expect(decodeBsv21Owned(tx.outputs[2 - j].lockingScript)?.owner).toEqual({ kind: 'p2pkh', pkh: receivePkh(agentP.identityKey, Number(pPledge.record.tokenIndex)) })
    await verifyAs(pPledge, agentP, plan)
    await verifyAs(vPledge, agentV, plan)
  })

  it('a coordinator cannot flip the lock: unlocking V (guard bypass) or locking P are both refused', async () => {
    const [cp, cv] = candidates()
    const { creditLock: _, ...unlocked } = cv.record
    const freed = planSettlement(offer, [cp, { ...cv, record: unlocked }], await chainInfo()) // V's credits to a plain P2PKH
    await expect(verifyAs(vPledge, agentV, freed)).rejects.toThrow(/creditLock ≠ its pledge record/)
    await expect(verifyAs(pPledge, agentP, freed)).rejects.toThrow(/creditLock ≠ its pledge record/) // every participant checks everyone
    await expect(signSettlementInput(freed, 1 + freed.participants.findIndex(p => p.outpoint === vPledge.outpoint), vaultSigner(freed)))
      .rejects.toThrow(CosignRejected) // and the guard (same verifier, record from chain) refuses to co-sign
  })

  it('settle: guard co-signs V; P\'s 600 arrive through the overlay; V\'s 400 sit on the vault script', async () => {
    const sigs: Record<number, UnlockingScript> = {}
    const iP = 1 + plan.participants.findIndex(p => p.outpoint === pPledge.outpoint)
    sigs[iP] = await signSettlementInput(plan, iP, new P2pkhWalletSigner(agentP, { protocolID: pPledge.instructions.protocolID, keyID: pPledge.instructions.keyID }))
    sigs[1 + j] = await signSettlementInput(plan, 1 + j, vaultSigner(plan))
    settlement = assembleSettlement(plan, sigs)
    expect(await settlement.verify('scripts only')).toBe(true)
    await internalizeSettlement(agentP, settlement, plan, pPledge.outpoint, pPledge.instructions) // broadcasts (mock chain)
    await kitA.overlay.submit(settlement.toAtomicBEEF())
    await kitA.sync()
    expect((await kitA.balances()).find(b => b.tokenId === terms.tokenId)).toMatchObject({ overlay: 600n, basket: 600n })
  })

  it('admission: default rules leave the vault output out; with ownerKinds it is admitted and its lineage holds', async () => {
    const withSources = Transaction.fromAtomicBEEF(settlement.toAtomicBEEF())
    expect(identifyAdmissible(withSources, [0]).outputsToAdmit).not.toContain(1 + j)
    expect(identifyAdmissible(withSources, [0], VAULT_RULES).outputsToAdmit).toContain(1 + j)
    const out = `${settlement.id('hex')}_${1 + j}`
    expect((await verifyLineage(out, { fetchTx })).ok).toBe(false)
    expect(await verifyLineage(out, { fetchTx, ownerKinds: VAULT_RULES.ownerKinds })).toMatchObject({
      ok: true, tokenId: terms.tokenId, amt: 400n, owner: { kind: 'vault', vaultScriptHex: vault.lockingScriptHex }
    })
  })

  it('script: the agent alone cannot move its credits; agent + guard or the owner alone can', async () => {
    const spendTx = (): Transaction => {
      const tx = new Transaction()
      tx.addInput({ sourceTransaction: settlement, sourceOutputIndex: 1 + j, sequence: 0xffffffff })
      tx.addOutput({ lockingScript: buildBsv21Script({ op: 'transfer', id: terms.tokenId, amt: '400' }, receivePkh(agentV.identityKey, 0)), satoshis: 1 })
      return tx
    }
    const sig = async (w: Wallet, tx: Transaction): Promise<number[]> =>
      toChecksigSignature((await w.createSignature({ hashToDirectlySign: vaultSighash(tx, 0), protocolID: VAULT_PROTOCOL, keyID: vault.record.vaultId, counterparty: 'anyone' })).signature)
    const valid = async (unlock: (tx: Transaction) => Promise<UnlockingScript>): Promise<boolean> => {
      const tx = spendTx(); tx.inputs[0].unlockingScript = await unlock(tx); return inputScriptValid(tx, 0)
    }
    expect(await valid(async tx => vaultCosignUnlock(await sig(agentV, tx), await sig(agentV, tx)))).toBe(false)
    expect(await valid(async tx => vaultOwnerUnlock(await sig(agentV, tx)))).toBe(false)
    expect(await valid(async tx => vaultCosignUnlock(await sig(agentV, tx), await sig(guardWallet, tx)))).toBe(true) // what the guard would sign (5.4)
    expect(await valid(async tx => vaultOwnerUnlock(await sig(owner, tx)))).toBe(true)
  })
  it('5.4: V takes its vault-locked credits, redeems 150 at the provider (agent + guard), 250 stay locked', async () => {
    // Stand-in for the guard's 'redeem' / 'list' policy (Track D): sign only for an allowed recipient.
    const creditGuard = (allowed: string[]): Cosigner => async req => {
      if (req.context.kind !== 'redeem' && req.context.kind !== 'list') throw new CosignRejected(403, `kind ${req.context.kind}`)
      const tx = Transaction.fromAtomicBEEF(typeof req.txBEEF === 'string' ? Utils.toArray(req.txBEEF, 'hex') : req.txBEEF!)
      const out = decodeBsv21Owned(tx.outputs[0].lockingScript)
      if (out?.owner.kind !== 'p2pkh' || !allowed.includes(out.owner.pkh)) throw new CosignRejected(403, 'recipient not allowed')
      const { signature } = await guardWallet.createSignature({ hashToDirectlySign: vaultSighash(tx, req.inputIndex), protocolID: VAULT_PROTOCOL, keyID: vault.record.vaultId, counterparty: 'anyone' })
      return { signatureHex: Utils.toHex(toChecksigSignature(signature)), guardPub: '' }
    }
    const redeemPkh = receivePkh(provider.identityKey, 0)
    const credit = await internalizeVaultCredits(agentV, settlement, plan, vPledge.outpoint, vault.record.vaultId)
    expect(credit).toMatchObject({ outpoint: `${settlement.id('hex')}_${1 + j}`, amt: 400n, tokenId: terms.tokenId })
    expect((await listVaultCredits(agentV, vault.record.vaultId)).map(c => c.amt)).toEqual([400n])

    // A recipient the guard does not allow: nothing moves, the action is aborted.
    await expect(transferVaultCredits(agentV, { vaultId: vault.record.vaultId, credit, amt: 150n, toPkh: receivePkh(agentV.identityKey, 7), kind: 'list', cosign: creditGuard([redeemPkh]) }))
      .rejects.toThrow(CosignRejected)
    expect((await listVaultCredits(agentV, vault.record.vaultId)).map(c => c.amt)).toEqual([400n])

    const r = await transferVaultCredits(agentV, { vaultId: vault.record.vaultId, credit, amt: 150n, toPkh: redeemPkh, kind: 'redeem', cosign: creditGuard([redeemPkh]) })
    const tx = Transaction.fromAtomicBEEF(r.beef)
    expect(inputScriptValid(tx, 0)).toBe(true)
    expect(decodeBsv21Owned(tx.outputs[0].lockingScript)).toMatchObject({ amount: 150n, owner: { kind: 'p2pkh', pkh: redeemPkh } })
    expect(decodeBsv21Owned(tx.outputs[1].lockingScript)).toMatchObject({ amount: 250n, owner: { kind: 'vault', vaultScriptHex: vault.lockingScriptHex } })
    expect(r.rest).toMatchObject({ outpoint: `${r.txid}_1`, amt: 250n })
    expect((await listVaultCredits(agentV, vault.record.vaultId)).map(c => c.amt)).toEqual([250n])

    // Admission and lineage need the vault-aware rules (B: overlay ownerKinds).
    expect(identifyAdmissible(tx, [0], VAULT_RULES).outputsToAdmit).toEqual([0, 1])
    expect(identifyAdmissible(tx, [0]).outputsToAdmit).toEqual([])
    expect(await verifyLineage(`${r.txid}_0`, { fetchTx, ownerKinds: VAULT_RULES.ownerKinds })).toMatchObject({ ok: true, amt: 150n, ownerPkh: redeemPkh })

    // The owner takes the remaining 250 alone (VaultOwnerSigner now reads keys from vault-locked credits too).
    const back = new Transaction()
    back.addInput({ sourceTransaction: tx, sourceOutputIndex: 1, sequence: 0xffffffff })
    back.addOutput({ lockingScript: buildBsv21Script({ op: 'transfer', id: terms.tokenId, amt: '250' }, receivePkh(owner.identityKey, 0)), satoshis: 1 })
    back.inputs[0].unlockingScript = await new VaultOwnerSigner(owner, { vaultId: vault.record.vaultId }).sign(back, 0)
    expect(inputScriptValid(back, 0)).toBe(true)
    await expect(new VaultOwnerSigner(agentV, { vaultId: vault.record.vaultId }).sign(back, 0)).rejects.toThrow(/not locked to this owner/)
  })

  it('5.4 list: V lists its 250 vault-locked credits (agent + guard SINGLE|ACP, proceeds to the vault); P sweeps them through the overlay', async () => {
    const vaultId = vault.record.vaultId
    const [credit] = await listVaultCredits(agentV, vaultId)
    expect(credit.amt).toBe(250n)
    const { txid } = parseOutpoint(credit.outpoint)
    await kitA.overlay.submit(Transaction.fromBEEF(credit.beef, txid).toAtomicBEEF()) // the 5.4 redeem (overlay: vault-locked input admitted)

    await expect(signVaultCreditListing(agentV, { vaultId, credit, askSats: '5000', cosign })).rejects.toThrow(/minAskSatsPerCredit/) // listing off
    await putPolicy(new AuthFetch(owner), guardUrl, agentV.identityKey, { allowProviders: [provider.identityKey], ...policy, minAskSatsPerCredit: 20 })
    await expect(signVaultCreditListing(agentV, { vaultId, credit, askSats: '4999', cosign })).rejects.toThrow(CosignRejected) // below 250 × 20
    const listing = await signVaultCreditListing(agentV, { vaultId, credit, askSats: '5000', cosign })
    expect(listing).toMatchObject({ outpoint: credit.outpoint, credits: '250', askSats: '5000', payScriptHex: vault.lockingScriptHex, seller: agentV.identityKey })
    verifyListing(listing, { sourceTx: Transaction.fromBEEF(credit.beef, txid) })
    // Track B's POST /listings check against the overlay's view of the credit output.
    expect(coordinatorVerifyListing(listing, await new OverlayLookup(overlay.url).tokenOutput(listing.outpoint)).outpoint).toBe(listing.outpoint)

    const swept = await buildSweep(agentP, kitA, [listing], { lineage: { fetchTx }, getBeef: async () => credit.beef })
    expect(swept.credits).toBe('250')
    expect(swept.tx.outputs[0].satoshis).toBe(5_000)
    expect(swept.tx.outputs[0].lockingScript.toHex()).toBe(vault.lockingScriptHex) // the proceeds stay under the vault's rules
    await kitA.sync()
    expect((await kitA.balances()).find(b => b.tokenId === terms.tokenId)?.overlay).toBe(850n)
    // The seller's wallet learns of the spend only when it syncs; the overlay already knows.
    expect((await new OverlayLookup(overlay.url).tokenOutput(listing.outpoint))?.spent).toBe(true)
  })
})
