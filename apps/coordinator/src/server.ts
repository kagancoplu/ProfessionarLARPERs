/**
 * AgentCoop coordinator + side API: `npm run coordinator` → http://localhost:8090
 *
 * POST/GET /offers, POST /pledges/lighthouse, GET /pools, /pools/:id, /pools/:id/pledges, /healthz,
 * WS /ws (hello, pool_update; with a settlement protocol also the signing
 * rounds: sign_request/response/reject, round_failed, settled, pool_failed).
 * The coordinator holds no funds and no keys; anyone can run one (FINAL-IDEA §4.5).
 *
 * Env: PORT (8090), OVERLAY_URL (http://localhost:8080), ARCADE_URL (block
 * height for `failed`), COORDINATOR_DB (./data/coordinator.db), COORDINATOR_POLL_MS (5000),
 * ROUND_TIMEOUT_MS (60000), MAX_ROUNDS (3), STARTUP_GRACE_MS (30000: no round right after a restart), SPENT_CHECK (woc|none), NETWORK (main|test),
 * LIGHTHOUSE_GUARDS (comma-separated guard URLs; default GUARD_URL or http://localhost:8091),
 * public edge (B-P5a): RATE_LIMIT (on|off), RATE_GET_PER_MIN (120), RATE_POST_PER_MIN (10),
 * WS_MAX_PER_IP (20), WS_MAX_CLIENTS (1000), WS_MAX_MSGS_PER_10S (40).
 */
import { createServer, type Server } from 'node:http'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { createApiRouter, type ApiDeps } from './api'
import { ArcadeHeight, type HeightSource } from './chain'
import { configFromEnv, type CoordinatorConfig } from './config'
import { CoordinatorEngine } from './engine'
import { subscribeOverlayEvents } from './events'
import { jsonLogger, type Logger } from './log'
import { rateLimit } from '../../../packages/overlay/src/limits'
import { coreProtocol, type SettlementProtocol } from './protocol'
import { noSpentChecker, WocSpentChecker, type SpentChecker } from './spent'
import { OverlayLookup } from './overlay'
import { OfferSource } from './offers'
import { GuardDirectory, lighthouseDesk } from './lighthouse'
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
  const overlay = new OverlayLookup(config.overlayUrl)
  const offers = new OfferSource(overlay, store)
  const lighthouse = lighthouseDesk(store, new GuardDirectory(config.lighthouseGuards ?? []))
  const deps: ApiDeps = {
    overlay,
    store,
    offers,
    height: opts.height ?? new ArcadeHeight(config.arcadeUrl),
    locking: () => engine?.locking() ?? new Set<string>(),
    feedCounts: () => feed.counts(),
    lighthouse,
    ...(opts.protocol !== undefined ? { coordinatorStatus: (poolId: string) => engine?.status(poolId) } : {})
  }
  const app = express()
  // Behind Caddy (B-P5a): req.ip is the client from X-Forwarded-For; direct local callers stay loopback.
  app.set('trust proxy', 'loopback')
  app.disable('x-powered-by')
  app.use((req, res, next) => {
    // Public API: anyone may read; POSTs verify signatures and unspent outputs themselves.
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    if (req.method === 'OPTIONS') { res.sendStatus(204); return }
    next()
  })
  if (config.rateLimit !== undefined) {
    app.use(rateLimit({ perMin: config.rateLimit.getPerMin, exemptLoopback: true, match: req => req.method === 'GET' }))
    app.use(rateLimit({ perMin: config.rateLimit.postPerMin, exemptLoopback: true, match: req => req.method === 'POST' }))
  }
  app.use(createApiRouter(deps))
  const server = createServer(app)
  const feed = new Feed(server, deps, config.pollMs, config.feedLimits)
  if (opts.protocol !== undefined) {
    engine = new CoordinatorEngine({
      overlay: deps.overlay,
      store,
      offers,
      height: deps.height,
      protocol: opts.protocol,
      spent: opts.spent ?? (config.spentCheck === 'woc' ? new WocSpentChecker(config.network) : noSpentChecker),
      feed,
      log: opts.log ?? jsonLogger,
      lighthouse
    }, { roundTimeoutMs: config.roundTimeoutMs, maxRounds: config.maxRounds, tickMs: config.pollMs, startupGraceMs: config.startupGraceMs ?? 0 })
    feed.onParticipantMessage = (identity, msg) => engine!.onParticipantMessage(identity, msg)
  }
  await engine?.load()
  await new Promise<void>(resolve => server.listen(config.port, resolve))
  feed.start()
  engine?.start()
  // Overlay events (B.P3): re-read within ~100 ms of a pledge/settlement reaching the overlay.
  let debounce: NodeJS.Timeout | undefined
  const subscription = subscribeOverlayEvents(config.overlayUrl, () => {
    offers.forget() // a published offer may just have arrived
    if (debounce !== undefined) return
    debounce = setTimeout(() => {
      debounce = undefined
      void feed.poll()
      void engine?.tick()
    }, 100)
  }, opts.log ?? jsonLogger)
  return {
    url: `http://localhost:${config.port}`,
    server,
    feed,
    deps,
    ...(engine !== undefined ? { engine } : {}),
    close: async () => {
      subscription.close()
      if (debounce !== undefined) clearTimeout(debounce)
      engine?.stop()
      await feed.close()
      await new Promise<void>(resolve => {
        server.close(() => resolve())
        server.closeAllConnections() // keep-alive sockets would otherwise outlive a restart
      })
      await store.close()
    }
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = configFromEnv()
  // Track A's protocol: planSettlement / assembleSettlement / broadcastEF (Arcade) from @agentcoop/core.
  const c = await startCoordinator(config, { protocol: coreProtocol({ arcadeUrl: config.arcadeUrl }) })
  console.log(`AgentCoop coordinator at ${c.url} (overlay ${config.overlayUrl}, WS ${c.url.replace('http', 'ws')}/ws, signing rounds: ${c.engine !== undefined ? 'on' : 'off (no settlement protocol yet)'})`)
}
