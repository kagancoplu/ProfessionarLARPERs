/**
 * AgentCoop coordinator + side API: `npm run coordinator` → http://localhost:8090
 *
 * POST/GET /offers, GET /pools, /pools/:id, /pools/:id/pledges, /healthz,
 * WS /ws (hello, pool_update; with a settlement protocol also the signing
 * rounds: sign_request/response/reject, round_failed, settled, pool_failed).
 * The coordinator holds no funds and no keys; anyone can run one (FINAL-IDEA §4.5).
 *
 * Env: PORT (8090), OVERLAY_URL (http://localhost:8080), ARCADE_URL (block
 * height for `failed`), COORDINATOR_DB (./data/coordinator.db), COORDINATOR_POLL_MS (5000),
 * ROUND_TIMEOUT_MS (60000), MAX_ROUNDS (3), SPENT_CHECK (woc|none), NETWORK (main|test).
 */
import { createServer, type Server } from 'node:http'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { createApiRouter, type ApiDeps } from './api'
import { ArcadeHeight, type HeightSource } from './chain'
import { configFromEnv, type CoordinatorConfig } from './config'
import { CoordinatorEngine } from './engine'
import { jsonLogger, type Logger } from './log'
import type { SettlementProtocol } from './protocol'
import { noSpentChecker, WocSpentChecker, type SpentChecker } from './spent'
import { OverlayLookup } from './overlay'
import { CoordinatorStore } from './store'
import { Feed } from './ws'

export interface RunningCoordinator {
  url: string
  server: Server
  feed: Feed
  deps: ApiDeps
  engine?: CoordinatorEngine
  close: () => Promise<void>
}

export interface CoordinatorOptions {
  height?: HeightSource
  /** Track A's protocol (planSettlement / assembleSettlement / broadcast). Without it: side API + feed only. */
  protocol?: SettlementProtocol
  spent?: SpentChecker
  log?: Logger
}

export async function startCoordinator (config: CoordinatorConfig, opts: CoordinatorOptions = {}): Promise<RunningCoordinator> {
  const store = await CoordinatorStore.open(config.dbFile)
  let engine: CoordinatorEngine | undefined
  const deps: ApiDeps = {
    overlay: new OverlayLookup(config.overlayUrl),
    store,
    height: opts.height ?? new ArcadeHeight(config.arcadeUrl),
    locking: () => engine?.locking() ?? new Set<string>(),
    ...(opts.protocol !== undefined ? { coordinatorStatus: (poolId: string) => engine?.status(poolId) } : {})
  }
  const app = express()
  app.use((req, res, next) => {
    // Read endpoints are public (Faz 5 tightens CORS and adds rate limits).
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    if (req.method === 'OPTIONS') { res.sendStatus(204); return }
    next()
  })
  app.use(createApiRouter(deps))
  const server = createServer(app)
  const feed = new Feed(server, deps, config.pollMs)
  if (opts.protocol !== undefined) {
    engine = new CoordinatorEngine({
      overlay: deps.overlay,
      store,
      height: deps.height,
      protocol: opts.protocol,
      spent: opts.spent ?? (config.spentCheck === 'woc' ? new WocSpentChecker(config.network) : noSpentChecker),
      feed,
      log: opts.log ?? jsonLogger
    }, { roundTimeoutMs: config.roundTimeoutMs, maxRounds: config.maxRounds, tickMs: config.pollMs })
    feed.onParticipantMessage = (identity, msg) => engine!.onParticipantMessage(identity, msg)
  }
  await new Promise<void>(resolve => server.listen(config.port, resolve))
  feed.start()
  engine?.start()
  return {
    url: `http://localhost:${config.port}`,
    server,
    feed,
    deps,
    ...(engine !== undefined ? { engine } : {}),
    close: async () => {
      engine?.stop()
      await feed.close()
      await new Promise<void>(resolve => server.close(() => resolve()))
      await store.close()
    }
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = configFromEnv()
  const c = await startCoordinator(config)
  // Track A's protocol is wired here once @agentcoop/core exists (plan/phases/B-P2.md §2).
  console.log(`AgentCoop coordinator at ${c.url} (overlay ${config.overlayUrl}, WS ${c.url.replace('http', 'ws')}/ws, signing rounds: ${c.engine !== undefined ? 'on' : 'off (no settlement protocol yet)'})`)
}
