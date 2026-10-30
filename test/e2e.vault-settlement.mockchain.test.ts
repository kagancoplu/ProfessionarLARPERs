/**
 * D-P2 §9.2 (track A 3.2, shared with A): a vault agent in a real settlement
 * round, on the mock chain (every script verified, the 2-of-2 vault input included).
 *
 *   provider:   TokenKit.deploy → buildReserveAndAnnounce → signOffer → POST /offers (B's coordinator)
 *   owner:      vault (agent V + guard) + policy + funding; V adopts the funding
 *   injection:  V, told to put the whole budget into pools, is refused at PLEDGE time (2.1b)
 *   agents:     P2PKH agent buildPledge 600 · V pledgeFromVault 400 (guard 2.1b) → tm_agentcoop
 *   round:      coordinator (A's planSettlement) → sign_request → each agent runs A's verifySettlementPlan;
 *               V signs through VaultSigner and the guard (2.1: plan → tx, terms from chain, DvP, lineage)
 *   after:      credits 600 / 400; V's change back on the vault script; the guard's reservation resolved
 *   refusals:   a tampered plan; a provider the owner revoked after the pledge → no guard signature,
 *               the coordinator blacklists V, nothing is broadcast
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AuthFetch, LockingScript, Transaction } from '@agentcoop/core/sdk'
import type { Wallet } from '@bsv/wallet-toolbox'
import { WebSocket } from 'ws'
import {
  buildPledge, buildReserveAndAnnounce, COOP_SERVICE, COOP_TOPIC, internalizeSettlement, OverlayClient, P2pkhWalletSigner, planTransaction,
  receivePkh, signOffer, signSettlementInput, TokenKit, verifySettlementPlan, type Offer, type PoolTerms, type SettlementPlan
} from '@agentcoop/core'
import { buildBsv21Script } from '@agentcoop/core/kit/inscription'
import {
  CosignRejected, VaultSigner, adoptVaultOutput, httpCosigner, internalizeVaultSettlement, listVaultUtxos, pledgeFromVault,
  type Cosigner, type VaultPledge, type VaultUtxo
} from '@agentcoop/core/signers/VaultSigner'
import { startOverlay, type RunningOverlay } from '../packages/overlay/src/server'
import { broadcastMock, lookup } from '../packages/overlay/test/helpers/settlement'
import { ManualHeight } from '../apps/coordinator/src/chain'
import { coreProtocol } from '../apps/coordinator/src/protocol'
import { noSpentChecker } from '../apps/coordinator/src/spent'
import { startCoordinator, type RunningCoordinator } from '../apps/coordinator/src/server'
import { signHello } from '../apps/coordinator/src/auth'
import { Guard } from '../apps/guard/src/guard'
import { createGuardApp } from '../apps/guard/src/server'
import { createVault, fundVault, putPolicy, registerVault, withdrawVault, type GuardPolicyInput, type VaultInfo } from '../apps/owner-cli/src/vault-ops'
import { overlayVaultUtxos } from '../apps/owner-cli/src/chain'
import { poolBalance } from '../scripts/lib/funding'
import { createMockChain, type MockChain } from './helpers/mockchain'

let chain: MockChain
let overlay: RunningOverlay
let coop: RunningCoordinator
let guard: Guard
let guardServer: Server
let guardUrl: string
let cosign: Cosigner
const coopLogs: any[] = []
const guardLogs: string[] = []

const kitFor = (w: Wallet): TokenKit => new TokenKit(w, new OverlayClient(overlay.url, undefined, 'main', undefined, COOP_TOPIC, COOP_SERVICE))
const fetchTx = async (txid: string): Promise<Transaction> =>
  Transaction.fromBinary(Array.from((await (chain.services as any).storage.getTransaction(txid)).rawTx as number[]))

const waitFor = async <T>(fn: () => T | undefined, ms = 30_000): Promise<T> => {
  const end = Date.now() + ms
  for (;;) {
    const v = fn()
    if (v !== undefined) return v
    if (Date.now() > end) throw new Error('timed out')
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

/** The pool transaction as the agent gets it from the overlay (the BEEF of `{ op:'pool' }`): transport only, the guard checks its txid. */
async function poolBEEF (poolId: string): Promise<number[]> {
  const res = await fetch(`${overlay.url}/lookup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service: COOP_SERVICE, query: { op: 'pool', poolId } }) })
  return (await res.json() as { outputs: Array<{ beef: number[] }> }).outputs[0].beef
}

/** The settlement as the overlay serves it (BEEF with ancestry). */
async function settlementTx (poolId: string, txid: string): Promise<Transaction> {
  const res = await fetch(`${overlay.url}/lookup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service: COOP_SERVICE, query: { op: 'settlement', poolId } }) })
  return Transaction.fromBEEF((await res.json() as { outputs: Array<{ beef: number[] }> }).outputs[0].beef, txid)
}

type Signing = { kind: 'p2pkh', pledge: Awaited<ReturnType<typeof buildPledge>> } | { kind: 'vault', pledge: VaultPledge, vaultId: string }

/** An agent on the coordinator's WS: checks the plan with A's verifier, signs its own input (P2PKH, or vault via the guard). */
async function agentBot (w: Wallet, pledges: Map<string, Signing>): Promise<{ ws: WebSocket, messages: any[], plans: Map<string, SettlementPlan>, rejects: string[] }> {
  const { publicKey: identity } = await w.getPublicKey({ identityKey: true })
  const ws = new WebSocket(`${coop.url.replace('http', 'ws')}/ws`)
  const messages: any[] = []
  const plans = new Map<string, SettlementPlan>()
  const rejects: string[] = []
  // listen before 'open': the coordinator's challenge is the first frame (B.P5a)
  const opened = new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject) })
  const reject = (msg: any, reason: string): void => {
    rejects.push(reason)
    ws.send(JSON.stringify({ type: 'sign_reject', poolId: msg.poolId, round: msg.round, reason }))
  }
  ws.on('message', d => {
    const msg = JSON.parse(d.toString())
    messages.push(msg)
    if (msg.type === 'challenge') {
      // proven hello (B.P5a): sign_request only reaches sessions that signed the coordinator's nonce
      void signHello(w, new URL(coop.url).host, msg.nonce).then(sig => { ws.send(JSON.stringify({ type: 'hello', identity, poolIds: [], sig })) })
      return
    }
    if (msg.type !== 'sign_request') return
    void (async () => {
      const s = pledges.get(msg.poolId)
      if (s === undefined) return
      const plan = msg.plan as SettlementPlan
      const offer = await (await fetch(`${coop.url}/offers/${msg.poolId}`)).json() as Offer
      try {
        await verifySettlementPlan(plan, offer, s.pledge.outpoint, {
          expectedCredits: s.pledge.record.credits,
          expectedCreditPkh: receivePkh(identity, Number(s.pledge.record.tokenIndex)),
          verifyLineage: true,
          lineage: { fetchTx }
        })
      } catch (e) { reject(msg, (e as Error).message); return }
      plans.set(msg.poolId, plan)
      try {
        const signer = s.kind === 'p2pkh'
          ? new P2pkhWalletSigner(w, { protocolID: s.pledge.instructions.protocolID, keyID: s.pledge.instructions.keyID })
          : new VaultSigner(w, { vaultId: s.vaultId, cosign, plan, context: { kind: 'settle', poolId: msg.poolId, expectedCredits: s.pledge.record.credits, tokenId: offer.terms.tokenId } })
        const unlock = await signSettlementInput(plan, msg.yourInputIndex, signer)
        ws.send(JSON.stringify({ type: 'sign_response', poolId: msg.poolId, round: msg.round, inputIndex: msg.yourInputIndex, unlockingScriptHex: unlock.toHex() }))
      } catch (e) {
        reject(msg, e instanceof CosignRejected ? `guard: ${e.reason}` : (e as Error).message)
      }
    })()
  })
  await opened
  for (const end = Date.now() + 10_000; !messages.some(m => m.type === 'hello_ack' && m.proven === true);) {
    if (Date.now() > end) throw new Error(`agent bot: no proven hello_ack; got ${JSON.stringify(messages.map(m => m.type))}`)
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  return { ws, messages, plans, rejects }
}

beforeAll(async () => {
  chain = await createMockChain()
  const dir = mkdtempSync(join(tmpdir(), 'agentcoop-vault-e2e-'))
  overlay = await startOverlay({ port: 18790, dbFile: join(dir, 'overlay.db'), chainTracker: chain.chainTracker, quiet: true })
  const height = await chain.services.getHeight()
  coop = await startCoordinator(
    { port: 18791, overlayUrl: overlay.url, arcadeUrl: 'http://unused.invalid', dbFile: join(dir, 'coordinator.db'), pollMs: 500, roundTimeoutMs: 20_000, maxRounds: 3, spentCheck: 'none', network: 'main' },
    {
      height: new ManualHeight(height),
      protocol: coreProtocol({ arcadeUrl: 'http://unused.invalid', policy: async () => ({ height, satsPerKb: 100 }), broadcast: async tx => { await broadcastMock(chain.services, tx); return tx.id('hex') } }),
      spent: noSpentChecker,
      log: (event, f) => { coopLogs.push({ event, ...f }) }
    }
  )
}, 60_000)

afterAll(async () => {
  guardServer?.close()
  await coop?.close()
  await overlay?.close()
  await chain?.close()
})

describe('vault agent in a coordinator settlement (guard 2.1 + 2.1b)', () => {
  let provider: Wallet, rogue: Wallet, agentP: Wallet, agentV: Wallet, owner: Wallet, guardWallet: Wallet
  let kitP: TokenKit, kitR: TokenKit, kitA: TokenKit, kitV: TokenKit
  let terms: PoolTerms, rogueTerms: PoolTerms
  let vault: VaultInfo
  let policy: GuardPolicyInput
  let vPledge: VaultPledge
  let pPledge: Awaited<ReturnType<typeof buildPledge>>
  const pledgesP = new Map<string, Signing>()
  const pledgesV = new Map<string, Signing>()
  let botP: Awaited<ReturnType<typeof agentBot>>, botV: Awaited<ReturnType<typeof agentBot>>
  const vaultUtxo = async (): Promise<VaultUtxo> => (await listVaultUtxos(agentV, vault.record.vaultId))[0]
  const refusal = async (p: Promise<unknown>): Promise<string> => {
    try { await p } catch (e) { if (e instanceof CosignRejected) return e.reason; throw e }
    throw new Error('expected the guard to refuse')
  }

  async function openPool (w: Wallet, kit: TokenKit, sym: string): Promise<PoolTerms> {
    const height = await chain.services.getHeight()
    const { tokenId } = await kit.deploy({ sym, amt: 1000n, dec: 0 })
    const reserved = await buildReserveAndAnnounce(w, kit, {
      v: '1', providerApi: 'http://localhost:8092', tokenId, credits: '1000', priceSats: '10000', feeSats: '50',
      minCredits: '100', deadlineHeight: String(height + 144), label: `${sym} · 1 week`, retailSatsPerCredit: '15'
    })
    const offer = await signOffer(w, reserved.terms.poolId, reserved.terms)
    const res = await fetch(`${coop.url}/offers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(offer) })
    expect(res.status).toBe(201)
    return reserved.terms
  }

  it('setup: two providers open pools; the owner funds a vault for agent V with a policy', async () => {
    ;[provider, rogue, agentP, agentV, owner, guardWallet] = await Promise.all(Array.from({ length: 6 }, async () => await chain.makeWallet()))
    for (const w of [provider, rogue, agentP, agentV]) await chain.fund(w)
    await chain.fund(owner, 100_000)
    ;[kitP, kitR, kitA, kitV] = [kitFor(provider), kitFor(rogue), kitFor(agentP), kitFor(agentV)]
    terms = await openPool(provider, kitP, 'H100')
    rogueTerms = await openPool(rogue, kitR, 'ROGUE')

    guard = await Guard.create({ wallet: guardWallet, fetchTx, log: l => guardLogs.push(l) })
    guardServer = createGuardApp(guard, guardWallet).listen(0)
    guardUrl = `http://127.0.0.1:${(guardServer.address() as AddressInfo).port}`
    cosign = httpCosigner(guardUrl)

    vault = await createVault(owner, { agent: agentV.identityKey, guard: guardWallet.identityKey })
    await registerVault(new AuthFetch(owner), guardUrl, vault)
    policy = { allowProviders: [provider.identityKey], maxPerPoolSats: 6_000, weeklyCapSats: 20_000, maxFeeSats: 500, hotWalletDailySats: 0 }
    await putPolicy(new AuthFetch(owner), guardUrl, agentV.identityKey, policy)
    const f = await fundVault(owner, vault, 20_000)
    await adoptVaultOutput(agentV, vault.record.vaultId, f.tx, f.vout)
    // the owner CLI's second source: Track B's overlay indexes the vault from its record
    await kitA.overlay.submit(f.tx)
    expect(await overlayVaultUtxos(overlay.url, vault)).toEqual([{ outpoint: `${f.txid}.${f.vout}`, satoshis: 20_000 }])
  })

  it('injection at pledge time: "put 100% of the budget into pool X" is refused, nothing moves', async () => {
    const utxo = await vaultUtxo()
    const index = await kitV.nextIndex(agentV.identityKey)
    // X's provider is not on the owner's allowlist (the guard fetches the pool tx itself here: no poolBEEF)
    expect(await refusal(pledgeFromVault(agentV, { vaultId: vault.record.vaultId, utxo, terms: rogueTerms, credits: '1000', tokenIndex: index, cosign })))
      .toBe(`provider not allowed: ${rogue.identityKey.slice(0, 10)}…`)
    // the allowed pool, but the whole pool (coin 10,301 + fee 50) > maxPerPoolSats 6,000
    expect(await refusal(pledgeFromVault(agentV, { vaultId: vault.record.vaultId, utxo, terms, credits: '1000', tokenIndex: index, cosign, poolBEEF: await poolBEEF(terms.poolId) })))
      .toBe('maxPerPoolSats exceeded (pledge 10351 > 6000)')
    expect(guardLogs.filter(l => l.includes('DENY pay')).length).toBe(2)
    expect((await listVaultUtxos(agentV, vault.record.vaultId)).map(u => u.satoshis)).toEqual([20_000])
    expect(guard.store.spentInWindow(owner.identityKey, agentV.identityKey, Date.now())).toBe(0)
  })

  it('pledges: P2PKH agent 600 (buildPledge), V 400 from the vault (guard 2.1b); the overlay counts both', async () => {
    pPledge = await buildPledge(agentP, terms, '600', 'p2pkh', undefined, { tokenIndex: await kitA.nextIndex(agentP.identityKey) })
    const vaultArgs = async () => ({ vaultId: vault.record.vaultId, utxo: await vaultUtxo(), cosign })
    await expect(buildPledge(agentV, terms, '400', 'vault', undefined, { tokenIndex: 0 } as any)).rejects.toThrow(/needs opts.vault/)
    await expect(buildPledge(agentV, terms, '400', 'vault', LockingScript.fromHex(terms.payScriptHex), { tokenIndex: 0, vault: await vaultArgs() })).rejects.toThrow(/not on the given vault script/)
    // A.3.1: buildPledge(…, 'vault') delegates to pledgeFromVault (same layout, guard 2.1b at pledge time)
    vPledge = await buildPledge(agentV, terms, '400', 'vault', LockingScript.fromHex(vault.lockingScriptHex), {
      tokenIndex: await kitV.nextIndex(agentV.identityKey),
      vault: { vaultId: vault.record.vaultId, utxo: await vaultUtxo(), cosign, poolBEEF: await poolBEEF(terms.poolId) }
    })
    const tx = Transaction.fromAtomicBEEF(vPledge.beef)
    expect(tx.outputs[0].lockingScript.toHex()).toBe(vault.lockingScriptHex) // the pledge coin stays on the vault script
    expect(vPledge.satoshis).toBe(4_301) // ceil(400·10,000/1,000) + 1 + 300 buffer
    expect(guardLogs.at(-1)).toMatch(/ALLOW pay\/pledge .* paid=50 .* committed=4301/)
    // ledger: the fee left the vault now (the agent's own input paid the miner), the coin is reserved for the pool
    const now = Date.now()
    expect(guard.store.poolSpent(owner.identityKey, agentV.identityKey, terms.poolId, now)).toBe(50 + 4_301)
    expect(guard.store.spentInWindow(owner.identityKey, agentV.identityKey, now)).toBe(50 + 4_301)

    pledgesP.set(terms.poolId, { kind: 'p2pkh', pledge: pPledge })
    pledgesV.set(terms.poolId, { kind: 'vault', pledge: vPledge, vaultId: vault.record.vaultId })
    botP = await agentBot(agentP, pledgesP)
    botV = await agentBot(agentV, pledgesV)
    for (const p of [pPledge, vPledge]) await kitA.overlay.submit(p.beef)
    const pledges = await lookup(overlay.url, { op: 'pledges', poolId: terms.poolId })
    expect(pledges.map(p => [p.ctx.signer, p.ctx.valid, p.ctx.credits]).sort()).toEqual([['p2pkh', true, '600'], ['vault', true, '400']])
  })

  let cost = 0
  it('round: the guard co-signs the vault input after its own DvP + lineage check; credits 600 / 400 arrive', async () => {
    const t0 = Date.now()
    const settled = await waitFor(() => botV.messages.find(m => m.type === 'settled' && m.poolId === terms.poolId))
    expect(botV.rejects).toEqual([])
    expect(coopLogs.some(l => l.event === 'sign_reject')).toBe(false)
    expect(guardLogs.some(l => /ALLOW settle/.test(l))).toBe(true)
    expect(Date.now() - t0).toBeLessThan(20_000) // well inside the 60 s round

    const plan = botV.plans.get(terms.poolId)!
    const settlement = await settlementTx(terms.poolId, settled.txid)
    expect(await settlement.verify('scripts only')).toBe(true) // the 2-of-2 vault input included
    const j = plan.participants.findIndex(p => p.outpoint === vPledge.outpoint)
    const n = plan.participants.length
    expect(plan.participants[j].signer).toBe('vault')
    expect(settlement.outputs[n + 1 + j].lockingScript.toHex()).toBe(vault.lockingScriptHex) // change back to the vault
    cost = vPledge.satoshis - settlement.outputs[n + 1 + j].satoshis!

    await internalizeSettlement(agentP, settlement, botP.plans.get(terms.poolId)!, pPledge.outpoint, pPledge.instructions)
    await internalizeVaultSettlement(agentV, settlement, plan, vPledge.outpoint, vault.record.vaultId)
    await kitA.sync(); await kitV.sync()
    expect((await kitA.balances()).find(b => b.tokenId === terms.tokenId)).toMatchObject({ overlay: 600n, basket: 600n })
    expect((await kitV.balances()).find(b => b.tokenId === terms.tokenId)).toMatchObject({ overlay: 400n, basket: 400n })
    expect((await listVaultUtxos(agentV, vault.record.vaultId)).map(u => u.satoshis)).toContain(vPledge.satoshis - cost)

    // the reservation (4,301) is resolved by the settlement's real cost; the pool's total is fee + cost
    const now = Date.now()
    expect(cost).toBeGreaterThan(4_001)
    expect(guard.store.poolSpent(owner.identityKey, agentV.identityKey, terms.poolId, now)).toBe(50 + cost)
    expect(guard.store.spentInWindow(owner.identityKey, agentV.identityKey, now)).toBe(50 + cost)
  })

  it('a coordinator that tampers with V\'s credit output gets no guard signature', async () => {
    const plan = botV.plans.get(terms.poolId)!
    const tx = planTransaction(plan)
    const j = plan.participants.findIndex(p => p.outpoint === vPledge.outpoint)
    tx.outputs[1 + j].lockingScript = buildBsv21Script({ op: 'transfer', id: terms.tokenId, amt: '400' }, receivePkh(rogue.identityKey, 0))
    const tampered: SettlementPlan = { ...plan, templateBEEF: tx.toAtomicBEEF() }
    const signer = new VaultSigner(agentV, { vaultId: vault.record.vaultId, cosign, plan: tampered, context: { kind: 'settle', poolId: terms.poolId, expectedCredits: '400' } })
    expect(await refusal(signer.sign(planTransaction(tampered), 1 + j))).toBe('BAD_PLAN: my credit output pays someone else')
    // and a plan for another pool than the agent asked about
    const other = new VaultSigner(agentV, { vaultId: vault.record.vaultId, cosign, plan, context: { kind: 'settle', poolId: rogueTerms.poolId } })
    expect(await refusal(other.sign(planTransaction(plan), 1 + j))).toBe('pool mismatch')
  })

  it('the owner takes the settlement change back alone (OP_IF branch)', async () => {
    const change = (await listVaultUtxos(agentV, vault.record.vaultId)).filter(u => u.satoshis === vPledge.satoshis - cost)
    const before = (await poolBalance(owner)).spendableSatoshis
    await withdrawVault(owner, vault, change)
    expect((await poolBalance(owner)).spendableSatoshis - before).toBeGreaterThan(vPledge.satoshis - cost - 100)
  })

  it('A.3.2 negative: the owner revokes a provider after V pledged; the guard refuses in the round, V is blacklisted, nothing is broadcast', async () => {
    await putPolicy(new AuthFetch(owner), guardUrl, agentV.identityKey, { ...policy, allowProviders: [provider.identityKey, rogue.identityKey] })
    const p2 = await buildPledge(agentP, rogueTerms, '600', 'p2pkh', undefined, { tokenIndex: await kitA.nextIndex(agentP.identityKey) })
    const utxo = (await listVaultUtxos(agentV, vault.record.vaultId))[0]
    const v2 = await pledgeFromVault(agentV, { vaultId: vault.record.vaultId, utxo, terms: rogueTerms, credits: '400', tokenIndex: await kitV.nextIndex(agentV.identityKey), cosign, poolBEEF: await poolBEEF(rogueTerms.poolId) })
    await putPolicy(new AuthFetch(owner), guardUrl, agentV.identityKey, policy) // revoked before the round
    pledgesP.set(rogueTerms.poolId, { kind: 'p2pkh', pledge: p2 })
    pledgesV.set(rogueTerms.poolId, { kind: 'vault', pledge: v2, vaultId: vault.record.vaultId })
    for (const p of [p2, v2]) await kitA.overlay.submit(p.beef)

    const failed = await waitFor(() => botV.messages.find(m => m.type === 'round_failed' && m.poolId === rogueTerms.poolId))
    expect(failed.missing).toEqual([v2.outpoint])
    expect(botV.rejects.at(-1)).toBe(`guard: provider not allowed: ${rogue.identityKey.slice(0, 10)}…`)
    const view = await (await fetch(`${coop.url}/pools/${rogueTerms.poolId}`)).json()
    expect(view.status).not.toBe('settled')
    expect(view.coordinator.blacklist).toEqual([{ outpoint: v2.outpoint, reason: `rejected: guard: provider not allowed: ${rogue.identityKey.slice(0, 10)}…` }])
    expect(botV.messages.some(m => m.type === 'settled' && m.poolId === rogueTerms.poolId)).toBe(false)
    // the pledge coins are untouched on chain (the vault's pledge coin is still the owner's to withdraw)
    const [pool] = await lookup(overlay.url, { op: 'pool', poolId: rogueTerms.poolId })
    expect(pool.ctx.status).toBe('open')
    for (const b of [botP, botV]) b.ws.close()
  })
})
