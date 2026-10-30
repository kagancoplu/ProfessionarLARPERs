/** Coordinator settings (MASTER §3.9). */
import { envInt } from '../../../packages/overlay/src/limits'
import { DEFAULT_FEED_LIMITS, type FeedLimits } from './ws'

export interface CoordinatorConfig {
  port: number
  overlayUrl: string
  arcadeUrl: string
  dbFile: string
  /** How often the WS feed and the engine re-read pools from the overlay. */
  pollMs: number
  /** MASTER §3.2: signing round timeout (~60 s) and max rounds (3). */
  roundTimeoutMs: number
  maxRounds: number
  /** Pre-round on-chain spent check of pledge coins: WhatsOnChain bulk, or none. */
  spentCheck: 'woc' | 'none'
  network: 'main' | 'test'
  /** Per-IP HTTP limits (B-P5a); undefined = none (tests). Loopback is exempt. */
  rateLimit?: { getPerMin: number, postPerMin: number }
  /** WS connection and message caps (B-P5a); default DEFAULT_FEED_LIMITS. */
  feedLimits?: FeedLimits
}

export function configFromEnv (env: NodeJS.ProcessEnv = process.env): CoordinatorConfig {
  return {
    port: Number(env.PORT ?? env.COOP_API_PORT ?? 8090),
    overlayUrl: env.OVERLAY_URL ?? 'http://localhost:8080',
    arcadeUrl: env.ARCADE_URL ?? 'https://arcade-v2-us-1.bsvblockchain.tech',
    dbFile: env.COORDINATOR_DB ?? './data/coordinator.db',
    pollMs: Number(env.COORDINATOR_POLL_MS ?? 5_000),
    roundTimeoutMs: Number(env.ROUND_TIMEOUT_MS ?? 60_000),
    maxRounds: Number(env.MAX_ROUNDS ?? 3),
    spentCheck: env.SPENT_CHECK === 'none' ? 'none' : 'woc',
    network: env.NETWORK === 'test' ? 'test' : 'main',
    ...(env.RATE_LIMIT === 'off' ? {} : { rateLimit: { getPerMin: envInt(env.RATE_GET_PER_MIN, 120), postPerMin: envInt(env.RATE_POST_PER_MIN, 10) } }),
    feedLimits: {
      maxPerIp: envInt(env.WS_MAX_PER_IP, DEFAULT_FEED_LIMITS.maxPerIp),
      maxClients: envInt(env.WS_MAX_CLIENTS, DEFAULT_FEED_LIMITS.maxClients),
      maxMessagesPer10s: envInt(env.WS_MAX_MSGS_PER_10S, DEFAULT_FEED_LIMITS.maxMessagesPer10s)
    }
  }
}
