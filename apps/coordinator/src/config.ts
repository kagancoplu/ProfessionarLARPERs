/** Coordinator settings (MASTER §3.9). */
export interface CoordinatorConfig {
  port: number
  overlayUrl: string
  arcadeUrl: string
  dbFile: string
  /** How often the WS feed re-reads pools from the overlay. */
  pollMs: number
}

export function configFromEnv (env: NodeJS.ProcessEnv = process.env): CoordinatorConfig {
  return {
    port: Number(env.PORT ?? env.COOP_API_PORT ?? 8090),
    overlayUrl: env.OVERLAY_URL ?? 'http://localhost:8080',
    arcadeUrl: env.ARCADE_URL ?? 'https://arcade-v2-us-1.bsvblockchain.tech',
    dbFile: env.COORDINATOR_DB ?? './data/coordinator.db',
    pollMs: Number(env.COORDINATOR_POLL_MS ?? 5_000)
  }
}
