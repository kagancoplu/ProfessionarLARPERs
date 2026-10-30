/**
 * AgentCoop overlay: `npm run overlay`. Copied from the starter kit's
 * overlay/server.ts; only the names changed (topic tm_agentcoop, service
 * ls_agentcoop).
 *
 * One process, one SQLite file, no MongoDB, no Docker. Standard overlay
 * endpoints: POST /submit (x-topics: ["tm_agentcoop"]) and POST /lookup
 * (service "ls_agentcoop"), plus GET /agentcoop/events (Server-Sent Events:
 * one event per admission and per spend).
 *
 * Env: PORT (8080), OVERLAY_DB (./data/overlay.db), NETWORK (main|test),
 *      OVERLAY_PRIVATE_KEY (hex; generated and saved to ./data/overlay.key if absent),
 *      TOKEN_WHITELIST (comma-separated token ids; empty = all tokens),
 *      CHAINTRACKS_URL or ARCADE_URL (block headers for SPV; default Arcade https://arcade-v2-us-1.bsvblockchain.tech),
 *      CHAIN_TRACKER=woc (use WhatsOnChain instead), WOC_API_KEY (optional WoC key).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import OverlayExpress from '@bsv/overlay-express'
import { PrivateKey, type ChainTracker } from '@bsv/sdk'
import { AgentCoopTopicManager, TOPIC } from './AgentCoopTopicManager'
import { makeAgentCoopLookupFactory, SERVICE } from './AgentCoopLookupService'
import { OverlayEvents, sseHandler } from './events'
import { noopAdvertiser } from './noopAdvertiser'
import { ResilientChainTracker } from './chainTracker'

export const DEFAULT_CHAINTRACKS_URL = 'https://arcade-v2-us-1.bsvblockchain.tech'

export interface OverlayOptions {
  port: number
  dbFile: string
  network?: 'main' | 'test'
  /** Explicit chain tracker (tests pass the mock chain's). Overrides chainSource. */
  chainTracker?: ChainTracker | 'scripts only'
  /** Where SPV block headers come from on mainnet: Arcade chaintracks (default) or WhatsOnChain. */
  chainSource?: 'arcade' | 'woc'
  chaintracksUrl?: string
  privateKey?: string
  whitelist?: string[]
  quiet?: boolean
}

export interface RunningOverlay {
  url: string
  events: OverlayEvents
  close: () => Promise<void>
}

export async function startOverlay (opts: OverlayOptions): Promise<RunningOverlay> {
  mkdirSync(dirname(resolve(opts.dbFile)), { recursive: true })
  const server = new OverlayExpress('agentcoop', opts.privateKey ?? PrivateKey.fromRandom().toHex(), `localhost:${opts.port}`)
  if (opts.quiet === true) {
    const silent = { ...console, log: () => {}, info: () => {}, warn: () => {}, debug: () => {} }
    server.configureLogger(silent as typeof console)
  }
  server.configurePort(opts.port)
  server.configureNetwork(opts.network ?? 'main')
  const network = opts.network ?? 'main'
  if (opts.chainTracker !== undefined) {
    server.configureChainTracker(opts.chainTracker)
  } else if (network === 'main' && opts.chainSource !== 'woc') {
    // Block headers from Arcade's go-chaintracks (BSV Association infrastructure).
    server.configureChaintracks(opts.chaintracksUrl ?? DEFAULT_CHAINTRACKS_URL, { apiPrefix: '/chaintracks/v2', reorgStream: false })
  } else {
    server.configureChainTracker(new ResilientChainTracker(network, process.env.WOC_API_KEY))
  }
  await server.configureKnex({ client: 'better-sqlite3', connection: { filename: opts.dbFile }, useNullAsDefault: true })
  server.configureEnableGASPSync(false)
  server.configureEngineParams({ advertiser: noopAdvertiser })
  server.configureTopicManager(TOPIC, new AgentCoopTopicManager(
    opts.whitelist !== undefined && opts.whitelist.length > 0 ? { whitelist: new Set(opts.whitelist) } : {}
  ))
  const events = new OverlayEvents()
  events.setMaxListeners(100)
  server.configureLookupServiceWithKnex(SERVICE, makeAgentCoopLookupFactory(events))
  // Registered before start() so it is matched before overlay-express's own middleware.
  server.app.get('/agentcoop/events', sseHandler(events))
  await server.configureEngine(false) // false = no SHIP/SLAP, so no MongoDB
  await server.start()
  return {
    url: `http://localhost:${opts.port}`,
    events,
    close: async () => {
      events.close()
      await server.close()
    }
  }
}

function loadOrCreateKey (file: string): string {
  if (process.env.OVERLAY_PRIVATE_KEY !== undefined) return process.env.OVERLAY_PRIVATE_KEY
  if (existsSync(file)) return readFileSync(file, 'utf8').trim()
  const key = PrivateKey.fromRandom().toHex()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, key, { mode: 0o600 })
  return key
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8080)
  const overlay = await startOverlay({
    port,
    dbFile: process.env.OVERLAY_DB ?? './data/overlay.db',
    network: (process.env.NETWORK as 'main' | 'test' | undefined) ?? 'main',
    privateKey: loadOrCreateKey('./data/overlay.key'),
    chainSource: process.env.CHAIN_TRACKER === 'woc' ? 'woc' : 'arcade',
    chaintracksUrl: process.env.CHAINTRACKS_URL ?? process.env.ARCADE_URL,
    whitelist: (process.env.TOKEN_WHITELIST ?? '').split(',').map(s => s.trim()).filter(Boolean)
  })
  console.log(`AgentCoop overlay running at ${overlay.url}  (topic ${TOPIC}, service ${SERVICE}, SPV headers: ${process.env.CHAIN_TRACKER === 'woc' ? 'WhatsOnChain' : (process.env.CHAINTRACKS_URL ?? process.env.ARCADE_URL ?? DEFAULT_CHAINTRACKS_URL)})`)
}
