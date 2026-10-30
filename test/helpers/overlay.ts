/**
 * Test overlay. Until Track B's packages/overlay (tm_agentcoop) is on main,
 * tests run the starter kit's overlay unchanged: same BSV-21 rules, names
 * tm_tokenkit / ls_tokenkit. Clients get those names via the OverlayClient
 * constructor (production default: tm_agentcoop / ls_agentcoop).
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ChainTracker } from '@bsv/sdk'
import { memoryOutbox, OverlayClient } from '@agentcoop/core'
import { startOverlay, type RunningOverlay } from '../../docs/starter/bsv21-token-kit/overlay/server'

export const KIT_OVERLAY_NAMES = { topic: 'tm_tokenkit', service: 'ls_tokenkit' }

export interface TestOverlay { url: string, client: () => OverlayClient, close: () => Promise<void> }

export async function startTestOverlay (chainTracker: ChainTracker): Promise<TestOverlay> {
  const dir = mkdtempSync(join(tmpdir(), 'agentcoop-overlay-'))
  const port = 19000 + Math.floor(Math.random() * 1000)
  const overlay: RunningOverlay = await startOverlay({ port, dbFile: join(dir, 'overlay.db'), chainTracker, quiet: true })
  return {
    url: overlay.url,
    client: () => new OverlayClient(overlay.url, memoryOutbox(), 'main', undefined, KIT_OVERLAY_NAMES),
    close: async () => { await overlay.close() }
  }
}
