/**
 * B.P6b (Faz 6.5): one settlement with 50 and with 100 participants, each a
 * separate wallet-toolbox wallet that checks the plan with Track A's
 * verifySettlementPlan (lineage included) and signs over a proven WS session.
 * Measures the signing round, the settlement's size and fee, and the overlay
 * submit; prints one JSON line per size (copied to STATUS). A third case mixes
 * in Mandate Vault agents (Track D's request for the D 6.1 / B 6.5 run): their
 * pledge coin comes from the vault through the guard, and they sign the
 * settlement with a VaultSigner that asks the guard to co-sign.
 *
 * SCALE_CASES=50,100,50v10 (default; "50v10" = 50 participants, 10 of them vault
 * agents) picks the cases; SCALE_OUT=<file> also appends the JSON lines there.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appendFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { buildPledge, type PoolTerms } from '@agentcoop/core'
import { AuthFetch } from '@agentcoop/core/sdk'
import type { Wallet } from '@bsv/wallet-toolbox'
import { VaultSigner, adoptVaultOutput, httpCosigner, listVaultUtxos, pledgeFromVault, type Cosigner } from '@agentcoop/core/signers/VaultSigner'
import { Guard } from '../../guard/src/guard'
import { createGuardApp } from '../../guard/src/server'
import { createVault, fundVault, putPolicy, registerVault } from '../../owner-cli/src/vault-ops'
import { startOverlay, type RunningOverlay } from '../../../packages/overlay/src/server'
import { createMockChain, type MockChain } from '../../../test/helpers/mockchain'
import { broadcastMock } from '../../../packages/overlay/test/helpers/settlement'
import { ManualHeight } from '../src/chain'
import { coreProtocol } from '../src/protocol'
import { noSpentChecker } from '../src/spent'
import { startCoordinator, type RunningCoordinator } from '../src/server'
import { startAgentBot, type AgentBot } from './helpers/agentBot'
import { fetchTxFrom, kitOn, openCoopPool, retrySocket, waitUntil } from './helpers/coopPool'

const CASES = (process.env.SCALE_CASES ?? '50,100,50v10').split(',').map(c => {
  const [n, v] = c.split('v').map(Number)
  return { n, vaults: v ?? 0 }
}).filter(c => c.n > 0 && c.vaults <= c.n)
const CREDITS_EACH = 10

let chain: MockChain
let overlay: RunningOverlay
let coop: RunningCoordinator
const logs: Array<{ t: number, event: string, [k: string]: any }> = []
let guard: { wallet: Wallet, server: Server, url: string, cosign: Cosigner, logs: string[] } | undefined

/** Track D's guard, started once for the vault case. */
async function startGuard (): Promise<NonNullable<typeof guard>> {
  if (guard !== undefined) return guard
  const wallet = await chain.makeWallet()
  const logs: string[] = []
  const g = await Guard.create({ wallet, fetchTx: fetchTxFrom(chain), log: l => logs.push(l) })
  const server = createGuardApp(g, wallet).listen(0)
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  guard = { wallet, server, url, cosign: httpCosigner(url), logs }
  return guard
}

/** The pool transaction as an agent gets it from the overlay (BEEF of `{ op:'pool' }`), for the guard's pledge check. */
async function poolBEEF (poolId: string): Promise<number[]> {
  const res = await fetch(`${overlay.url}/lookup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service: 'ls_agentcoop', query: { op: 'pool', poolId } }) })
  return (await res.json() as { outputs: Array<{ beef: number[] }> }).outputs[0].beef
}

/** A vault agent: the owner creates, registers and funds its vault; the agent pledges from it through the guard. */
async function vaultAgent (w: Wallet, owner: Wallet, provider: Wallet, terms: PoolTerms): Promise<AgentBot & { beef: number[] }> {
  const g = await startGuard()
  const vault = await createVault(owner, { agent: w.identityKey, guard: g.wallet.identityKey })
  await registerVault(new AuthFetch(owner), g.url, vault)
  await putPolicy(new AuthFetch(owner), g.url, w.identityKey, { allowProviders: [provider.identityKey], maxPerPoolSats: 5_000, weeklyCapSats: 20_000, maxFeeSats: 500, hotWalletDailySats: 0 })
  const f = await fundVault(owner, vault, 10_000)
  await adoptVaultOutput(w, vault.record.vaultId, f.tx, f.vout)
  await retrySocket(async () => await kitOn(overlay.url, owner).overlay.submit(f.tx))
  const kit = kitOn(overlay.url, w)
  const [utxo] = await listVaultUtxos(w, vault.record.vaultId)
  const tokenIndex = await retrySocket(async () => await kit.nextIndex(w.identityKey))
  const p = await pledgeFromVault(w, { vaultId: vault.record.vaultId, utxo, terms, credits: String(CREDITS_EACH), tokenIndex, cosign: g.cosign, poolBEEF: await retrySocket(async () => await poolBEEF(terms.poolId)) })
  const bot = await startAgentBot(coop.url, w, w.identityKey, p, fetchTxFrom(chain), {
    signer: (plan, offer) => new VaultSigner(w, { vaultId: vault.record.vaultId, cosign: g.cosign, plan, context: { kind: 'settle', poolId: terms.poolId, expectedCredits: p.record.credits, tokenId: offer.terms.tokenId } })
  })
  return { ...bot, beef: p.beef }
}

beforeAll(async () => {
  chain = await createMockChain()
  const dir = mkdtempSync(join(tmpdir(), 'agentcoop-scale-'))
  overlay = await startOverlay({ port: 18990, dbFile: join(dir, 'overlay.db'), chainTracker: chain.chainTracker, quiet: true })
  const height = await chain.services.getHeight()
  coop = await startCoordinator(
    { port: 18991, overlayUrl: overlay.url, arcadeUrl: 'http://unused.invalid', dbFile: join(dir, 'coordinator.db'), pollMs: 1_000, roundTimeoutMs: 60_000, maxRounds: 3, spentCheck: 'none', network: 'main' },
    {
      height: new ManualHeight(height),
      protocol: coreProtocol({ arcadeUrl: 'http://unused.invalid', policy: async () => ({ height, satsPerKb: 100 }), broadcast: async tx => { await broadcastMock(chain.services, tx); return tx.id('hex') } }),
      spent: noSpentChecker,
      log: (event, f) => { logs.push({ t: Date.now(), event, ...f }) }
    }
  )
}, 600_000)

afterAll(async () => {
  guard?.server.close()
  await coop?.close()
  await overlay?.close()
  await chain?.close()
}, 120_000)

describe('scale: one settlement, many participants', () => {
  for (const { n, vaults } of CASES) {
    it(`${n} participants${vaults > 0 ? ` (${vaults} of them vault agents)` : ''} settle in one transaction`, async () => {
      const t0 = Date.now()
      const provider = await chain.makeWallet()
      await chain.fund(provider)
      const { terms, offer } = await openCoopPool(chain, overlay.url, provider, { credits: n * CREDITS_EACH, priceSats: n * 1_000, minCredits: CREDITS_EACH, sym: `SCALE${n}V${vaults}`.replace(/\d/g, d => 'ABCDEFGHIJ'[Number(d)]) })
      expect((await fetch(`${coop.url}/offers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(offer) })).status).toBe(201)

      // n agents: wallet, funds, pledge, proven WS session
      const tWallets = Date.now()
      const wallets = await Promise.all(Array.from({ length: n }, async () => await chain.makeWallet()))
      for (const w of wallets.slice(vaults)) await chain.fund(w, 20_000)
      for (const w of wallets.slice(0, vaults)) await chain.fund(w, 2_000) // a vault agent pays its pledge tx's miner fee itself
      const owner = await chain.makeWallet()
      if (vaults > 0) await chain.fund(owner, 1_000_000)
      const tPledges = Date.now()
      const bots: AgentBot[] = []
      const beefs: number[][] = []
      for (const w of wallets.slice(0, vaults)) {
        const v = await vaultAgent(w, owner, provider, terms)
        bots.push(v)
        beefs.push(v.beef)
      }
      for (const w of wallets.slice(vaults)) {
        const kit = kitOn(overlay.url, w)
        const me = await kit.identityKey()
        const p = await buildPledge(w, terms, String(CREDITS_EACH), 'p2pkh', undefined, { tokenIndex: await retrySocket(async () => await kit.nextIndex(me)) })
        bots.push(await startAgentBot(coop.url, w, me, p, fetchTxFrom(chain)))
        beefs.push(p.beef)
      }
      const submitter = kitOn(overlay.url, provider).overlay
      for (const b of beefs) await retrySocket(async () => await submitter.submit(b)) // the overlay takes a resubmitted tx
      const tFull = Date.now()

      const settled = await waitUntil(() => logs.find(l => l.event === 'settled' && l.poolId === terms.poolId), 240_000, `${n}-participant settlement`)
      const start = logs.find(l => l.event === 'round_start' && l.poolId === terms.poolId)!
      const broadcast = logs.find(l => l.event === 'broadcast' && l.poolId === terms.poolId)!
      expect(settled).toMatchObject({ participants: n, round: 1 })
      expect(logs.some(l => l.poolId === terms.poolId && (l.event === 'round_failed' || l.event === 'sign_bad'))).toBe(false)
      await waitUntil(() => bots.every(b => b.messages.some(m => m.type === 'settled' && m.poolId === terms.poolId)) ? true : undefined, 30_000, 'every agent saw settled')

      const audit = await (await fetch(`${coop.url}/pools/${terms.poolId}/audit`)).json()
      expect(audit.verdict).toBe('consistent')
      expect(audit.included).toHaveLength(n)
      const settlement = (await coop.deps.overlay.settlementWithTx(terms.poolId))!.tx
      let inSats = 0
      for (const i of settlement.inputs) inSats += i.sourceTransaction!.outputs[i.sourceOutputIndex].satoshis!
      const outSats = settlement.outputs.reduce((s, o) => s + (o.satoshis ?? 0), 0)
      const bytes = settlement.toBinary().length
      if (vaults > 0) {
        expect(guard!.logs.filter(l => /ALLOW settle/.test(l))).toHaveLength(vaults)
        expect((await (await fetch(`${coop.url}/metrics`)).json()).custodiedSats).toBe(0) // vault change goes back to the vault script
      }
      const result = {
        participants: n,
        vaultAgents: vaults,
        txBytes: bytes,
        feeSats: inSats - outSats,
        satsPerKb: Math.round((inSats - outSats) * 1000 / bytes),
        signRequestKb: Math.round(JSON.stringify(bots[0].messages.find(m => m.type === 'sign_request')).length / 1024),
        ms: {
          walletsAndFunds: tPledges - tWallets,
          pledgesAndSessions: tFull - tPledges,
          fullToRoundStart: start.t - tFull,
          signingRound: broadcast.t - start.t,
          // all n agents run in this one test process, so most of the round is their verifySettlementPlan + lineage walk
          firstSignature: Math.min(...logs.filter(l => l.event === 'sign_ok' && l.poolId === terms.poolId).map(l => l.t)) - start.t,
          lastSignature: Math.max(...logs.filter(l => l.event === 'sign_ok' && l.poolId === terms.poolId).map(l => l.t)) - start.t,
          broadcastToSettled: settled.t - broadcast.t,
          total: settled.t - t0
        }
      }
      console.log(`SCALE ${JSON.stringify(result)}`)
      if (process.env.SCALE_OUT !== undefined) appendFileSync(process.env.SCALE_OUT, JSON.stringify(result) + '\n')
      expect(result.feeSats).toBeGreaterThan(0)
      expect(result.satsPerKb).toBeLessThanOrEqual(150) // paid at the policy rate (100 sat/kB), not overpaid
      for (const b of bots) b.ws.close()
    }, 600_000)
  }
})
