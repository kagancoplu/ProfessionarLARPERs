/**
 * B.P6b (Faz 6.5): one settlement with 50 and with 100 participants, each a
 * separate wallet-toolbox wallet that checks the plan with Track A's
 * verifySettlementPlan (lineage included) and signs over a proven WS session.
 * Measures the signing round, the settlement's size and fee, and the overlay
 * submit; prints one JSON line per size (copied to STATUS).
 *
 * SCALE_SIZES=50,100 (default) picks the sizes; SCALE_OUT=<file> also appends the JSON lines there.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appendFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildPledge } from '@agentcoop/core'
import { startOverlay, type RunningOverlay } from '../../../packages/overlay/src/server'
import { createMockChain, type MockChain } from '../../../test/helpers/mockchain'
import { broadcastMock } from '../../../packages/overlay/test/helpers/settlement'
import { ManualHeight } from '../src/chain'
import { coreProtocol } from '../src/protocol'
import { noSpentChecker } from '../src/spent'
import { startCoordinator, type RunningCoordinator } from '../src/server'
import { startAgentBot, type AgentBot } from './helpers/agentBot'
import { fetchTxFrom, kitOn, openCoopPool, waitUntil } from './helpers/coopPool'

const SIZES = (process.env.SCALE_SIZES ?? '50,100').split(',').map(Number).filter(n => n > 0)
const CREDITS_EACH = 10

let chain: MockChain
let overlay: RunningOverlay
let coop: RunningCoordinator
const logs: Array<{ t: number, event: string, [k: string]: any }> = []

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
  await coop?.close()
  await overlay?.close()
  await chain?.close()
}, 120_000)

describe('scale: one settlement, many participants', () => {
  for (const n of SIZES) {
    it(`${n} participants settle in one transaction`, async () => {
      const t0 = Date.now()
      const provider = await chain.makeWallet()
      await chain.fund(provider)
      const { terms, offer } = await openCoopPool(chain, overlay.url, provider, { credits: n * CREDITS_EACH, priceSats: n * 1_000, minCredits: CREDITS_EACH, sym: `SCALE${n}`.replace(/\d/g, d => 'ABCDEFGHIJ'[Number(d)]) })
      expect((await fetch(`${coop.url}/offers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(offer) })).status).toBe(201)

      // n agents: wallet, funds, pledge, proven WS session
      const tWallets = Date.now()
      const wallets = await Promise.all(Array.from({ length: n }, async () => await chain.makeWallet()))
      for (const w of wallets) await chain.fund(w, 20_000)
      const tPledges = Date.now()
      const bots: AgentBot[] = []
      const beefs: number[][] = []
      for (const w of wallets) {
        const kit = kitOn(overlay.url, w)
        const me = await kit.identityKey()
        const p = await buildPledge(w, terms, String(CREDITS_EACH), 'p2pkh', undefined, { tokenIndex: await kit.nextIndex(me) })
        bots.push(await startAgentBot(coop.url, w, me, p, fetchTxFrom(chain)))
        beefs.push(p.beef)
      }
      const submitter = kitOn(overlay.url, provider).overlay
      for (const b of beefs) await submitter.submit(b)
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
      const result = {
        participants: n,
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
