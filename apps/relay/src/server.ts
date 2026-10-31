/** `npm start -w @agentcoop/relay` (or infra/run.mjs when SUPABASE_URL and SUPABASE_SECRET_KEY are set). */
import { loadConfig } from './config'
import { watchCoordinator } from './coordinator'
import { startRelay } from './relay'
import { createSources } from './sources'
import { followSse } from './sse'
import { createSupabaseSink } from './supabaseSink'

function main (): void {
  const cfg = loadConfig(process.env)
  // the probe's full error stays here; the mirror only gets a public class of it (F-8). Logged once per change.
  const lastProbe = new Map<string, string>()
  const logProbe = (line: string): void => {
    const service = line.split(':')[0]
    if (lastProbe.get(service) === line) return
    lastProbe.set(service, line)
    console.log(`[relay] ${line}`)
  }
  const relay = startRelay(cfg.urls, {
    sink: createSupabaseSink(cfg.supabaseUrl, cfg.supabaseSecretKey),
    sources: createSources(cfg.urls, fetch, logProbe),
    followSse,
    watchCoordinator
  })
  console.log(`[relay] coordinator ${cfg.urls.coop}, overlay ${cfg.urls.overlay}, guard/agents/maker SSE → ${new URL(cfg.supabaseUrl).host}`)
  const stop = (): void => { void relay.stop().finally(() => process.exit(0)) }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

try { main() } catch (err) {
  console.error(`[relay] ${String((err as Error).message ?? err)}`)
  process.exit(1)
}
