/**
 * Mainnet 31.10: WhatsOnChain answered "spent" for a pledge coin seconds old,
 * the coordinator blacklisted it as "spent on chain" and the full pool never
 * started a round. A coin blacklisted that way is asked again before each
 * round; once the chain says unspent it is back and the pool settles.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Transaction } from '@agentcoop/core/sdk'
import type { Wallet } from '@bsv/wallet-toolbox'
import { buildPledge, buildReserveAndAnnounce, COOP_SERVICE, COOP_TOPIC, OverlayClient, signOffer, TokenKit, type PoolTerms } from '@agentcoop/core'
import { startOverlay, type RunningOverlay } from '../../../packages/overlay/src/server'
import { createMockChain, type MockChain } from '../../../test/helpers/mockchain'
import { broadcastMock } from '../../../packages/overlay/test/helpers/settlement'
import { ManualHeight } from '../src/chain'
import { coreProtocol } from '../src/protocol'
import type { SpentChecker } from '../src/spent'
import { startCoordinator, type RunningCoordinator } from '../src/server'
import { startAgentBot } from './helpers/agentBot'
import { waitUntil } from './helpers/coopPool'

let chain: MockChain
let overlay: RunningOverlay
let coop: RunningCoordinator
const logs: any[] = []
const asked = new Map<string, number>()
// "Spent" the first time an outpoint is asked about, unspent afterwards (WoC's wrong first answer).
const flaky: SpentChecker = {
  spent: async outpoints => new Map(outpoints.map(o => { const n = (asked.get(o) ?? 0) + 1; asked.set(o, n); return [o, n === 1] }))
}
const kitFor = (w: Wallet): TokenKit => new TokenKit(w, new OverlayClient(overlay.url, undefined, 'main', undefined, COOP_TOPIC, COOP_SERVICE))
const fetchTx = async (txid: string): Promise<Transaction> =>
  Transaction.fromBinary(Array.from((await (chain.services as any).storage.getTransaction(txid)).rawTx as number[]))

beforeAll(async () => {
  chain = await createMockChain()
  const dir = mkdtempSync(join(tmpdir(), 'agentcoop-recheck-'))
  overlay = await startOverlay({ port: 18892, dbFile: join(dir, 'overlay.db'), chainTracker: chain.chainTracker, quiet: true })
  const height = await chain.services.getHeight()
  coop = await startCoordinator(
    { port: 18893, overlayUrl: overlay.url, arcadeUrl: 'http://unused.invalid', dbFile: join(dir, 'coordinator.db'), pollMs: 500, roundTimeoutMs: 20_000, maxRounds: 3, spentCheck: 'woc', network: 'main' },
    {
      height: new ManualHeight(height),
      protocol: coreProtocol({ arcadeUrl: 'http://unused.invalid', policy: async () => ({ height, satsPerKb: 100 }), broadcast: async tx => { await broadcastMock(chain.services, tx); return tx.id('hex') } }),
      spent: flaky,
      log: (event, f) => { logs.push({ event, ...f }) }
    }
  )
}, 60_000)
afterAll(async () => { await coop?.close(); await overlay?.close(); await chain?.close() })

describe('a coin wrongly reported spent on chain', () => {
  it('is blacklisted, asked again before the next round, and the pool still settles', async () => {
    const [provider, a1, a2] = await Promise.all([chain.makeWallet(), chain.makeWallet(), chain.makeWallet()])
    for (const w of [provider, a1, a2]) await chain.fund(w)
    const height = await chain.services.getHeight()
    const kitP = kitFor(provider)
    const { tokenId } = await kitP.deploy({ sym: 'RCHK', amt: 1000n, dec: 0 })
    const { terms } = await buildReserveAndAnnounce(provider, kitP, {
      v: '1', providerApi: 'http://localhost:8092', tokenId, credits: '1000', priceSats: '10000', feeSats: '50',
      minCredits: '100', deadlineHeight: String(height + 144), label: 'recheck', retailSatsPerCredit: '15'
    }) as { terms: PoolTerms }
    await fetch(`${coop.url}/offers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(await signOffer(provider, terms.poolId, terms)) })
    const [k1, k2] = [kitFor(a1), kitFor(a2)]
    const p1 = await buildPledge(a1, terms, '600', 'p2pkh', undefined, { tokenIndex: await k1.nextIndex(await k1.identityKey()) })
    const p2 = await buildPledge(a2, terms, '400', 'p2pkh', undefined, { tokenIndex: await k2.nextIndex(await k2.identityKey()) })
    const bots = [await startAgentBot(coop.url, a1, await k1.identityKey(), p1, fetchTx), await startAgentBot(coop.url, a2, await k2.identityKey(), p2, fetchTx)]
    for (const p of [p1, p2]) await k1.overlay.submit(p.beef)

    const settled = await waitUntil(() => bots[0].messages.find(m => m.type === 'settled' && m.poolId === terms.poolId), 40_000, 'settled')
    expect(settled.txid).toMatch(/^[0-9a-f]{64}$/)
    expect(logs.filter(l => l.event === 'unblacklisted').map(l => l.outpoint).sort()).toEqual([p1.outpoint, p2.outpoint].sort())
    const view = await (await fetch(`${coop.url}/pools/${terms.poolId}`)).json()
    expect(view).toMatchObject({ status: 'settled', coordinator: { blacklist: [] } })
  })
})
