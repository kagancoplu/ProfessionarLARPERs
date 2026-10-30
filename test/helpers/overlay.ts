/**
 * Test overlay: Track B's AgentCoop overlay (tm_agentcoop / ls_agentcoop) on the
 * mock chain, and OverlayClients configured with those names.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ChainTracker } from '@agentcoop/core/sdk'
import { COOP_SERVICE, COOP_TOPIC, memoryOutbox, OverlayClient } from '@agentcoop/core'
import { startOverlay, type RunningOverlay } from '../../packages/overlay/src/server'

export interface TestOverlay { url: string, client: () => OverlayClient, close: () => Promise<void> }

export async function startTestOverlay (chainTracker: ChainTracker): Promise<TestOverlay> {
  const dir = mkdtempSync(join(tmpdir(), 'agentcoop-overlay-'))
  const port = 19000 + Math.floor(Math.random() * 1000)
  const overlay: RunningOverlay = await startOverlay({ port, dbFile: join(dir, 'overlay.db'), chainTracker, quiet: true })
  return {
    url: overlay.url,
    client: () => new OverlayClient(overlay.url, memoryOutbox(), 'main', undefined, COOP_TOPIC, COOP_SERVICE),
    close: async () => { await overlay.close() }
  }
}
