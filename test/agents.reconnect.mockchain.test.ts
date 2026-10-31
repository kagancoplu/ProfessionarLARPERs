/**
 * Mainnet 31.10: after a coordinator restart the agents stayed off its WS
 * (one reconnect try while it was still down) and were never asked to sign.
 * The participant now keeps retrying until the coordinator is back, and a
 * restarted coordinator (with its startup grace) finds it there.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Wallet } from '@bsv/wallet-toolbox'
import { COOP_SERVICE, COOP_TOPIC, OverlayClient, TokenKit } from '@agentcoop/core'
import { startOverlay, type RunningOverlay } from '../packages/overlay/src/server'
import { startCoordinator, type RunningCoordinator } from '../apps/coordinator/src/server'
import type { CoordinatorConfig } from '../apps/coordinator/src/config'
import { ManualHeight } from '../apps/coordinator/src/chain'
import { PoolParticipant } from '../apps/agents/src/participant'
import { AgentLog } from '../apps/agents/src/log'
import { createMockChain, type MockChain } from './helpers/mockchain'

let chain: MockChain
let overlay: RunningOverlay
let coop: RunningCoordinator | undefined
let config: CoordinatorConfig
const proven = async (): Promise<number> => (await (await fetch(`${coop!.url}/healthz`)).json()).ws.proven

beforeAll(async () => {
  chain = await createMockChain()
  const dir = mkdtempSync(join(tmpdir(), 'agentcoop-reconnect-'))
  overlay = await startOverlay({ port: 18997, dbFile: join(dir, 'overlay.db'), chainTracker: chain.chainTracker, quiet: true })
  config = { port: 18998, overlayUrl: overlay.url, arcadeUrl: 'http://unused.invalid', dbFile: join(dir, 'coordinator.db'), pollMs: 500, roundTimeoutMs: 5_000, maxRounds: 3, spentCheck: 'none', network: 'main' }
  coop = await startCoordinator(config, { height: new ManualHeight(await chain.services.getHeight()) })
}, 60_000)
afterAll(async () => { await coop?.close(); await overlay?.close(); await chain?.close() })

describe('agent WS after a coordinator restart', () => {
  it('keeps retrying while the coordinator is down and is back on its WS once it returns', async () => {
    const wallet: Wallet = await chain.makeWallet()
    const kit = new TokenKit(wallet, new OverlayClient(overlay.url, undefined, 'main', undefined, COOP_TOPIC, COOP_SERVICE))
    const lines: string[] = []
    const p = new PoolParticipant({ wallet, kit, coopApiUrl: `http://localhost:${config.port}`, log: new AgentLog('reconnect', undefined, true, l => { lines.push(l) }) })
    await p.connect()
    expect(await proven()).toBe(1)

    await coop!.close()
    coop = undefined
    await new Promise(resolve => setTimeout(resolve, 5_000)) // down long enough for at least two failed tries
    expect(p.connected).toBe(false)

    coop = await startCoordinator(config, { height: new ManualHeight(await chain.services.getHeight()) })
    const end = Date.now() + 20_000
    while (!p.connected && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 200))
    expect(p.connected).toBe(true)
    expect(await proven()).toBe(1)
    expect(lines.some(l => l.includes('Back on the coordinator'))).toBe(true)
    p.close()
  }, 60_000)
})
