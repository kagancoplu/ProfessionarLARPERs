/**
 * Runtime environment for apps/web (MASTER §3.9 VITE_* variables, §3.10 browser rule).
 * Pure `resolveEnv` so tests can feed their own values; `env` is the live instance.
 *
 * Mode priority: `?mode=` → `?replay=<name>` → Vite `--mode mock` → VITE_DATA_MODE → live.
 * URLs: in `vite dev` the services are reached through the proxy paths (`/api/<service>`,
 * see vite.config.ts) unless VITE_USE_PROXY=false; in a build the VITE_* URLs are used as-is.
 */
export type DataMode = 'live' | 'mock' | 'replay'
export type ServiceName = 'coop' | 'overlay' | 'provider' | 'guard' | 'agents' | 'arcade'

export interface RawEnv {
  MODE?: string
  DEV?: boolean
  VITE_DATA_MODE?: string
  VITE_USE_PROXY?: string
  VITE_COOP_API_URL?: string
  VITE_OVERLAY_URL?: string
  VITE_PROVIDER_API_URL?: string
  VITE_GUARD_URL?: string
  VITE_AGENTS_URL?: string
  VITE_ARCADE_URL?: string
  VITE_NETWORK?: string
}

export interface AppEnv {
  mode: DataMode
  replayName?: string
  urls: Record<ServiceName, string>
  network: 'main' | 'test'
  /** WhatsOnChain transaction page base. */
  wocTx: string
  dev: boolean
}

const DEFAULT_URLS: Record<ServiceName, string> = {
  coop: 'http://localhost:8090',
  overlay: 'http://localhost:8080',
  provider: 'http://localhost:8092',
  guard: 'http://localhost:8091',
  agents: 'http://localhost:8093',
  arcade: 'https://arcade-v2-us-1.bsvblockchain.tech'
}

const PROXY_PATHS: Record<Exclude<ServiceName, 'arcade'>, string> = {
  coop: '/api/coop', overlay: '/api/overlay', provider: '/api/provider', guard: '/api/guard', agents: '/api/agents'
}

const isMode = (v: unknown): v is DataMode => v === 'live' || v === 'mock' || v === 'replay'

export function resolveEnv (raw: RawEnv, search = ''): AppEnv {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const replayName = params.get('replay') ?? undefined
  const urlMode = params.get('mode')
  let mode: DataMode = 'live'
  if (isMode(urlMode)) mode = urlMode
  else if (replayName !== undefined) mode = 'replay'
  else if (raw.MODE === 'mock') mode = 'mock'
  else if (isMode(raw.VITE_DATA_MODE)) mode = raw.VITE_DATA_MODE
  const dev = raw.DEV === true
  const useProxy = dev && raw.VITE_USE_PROXY !== 'false'
  const pick = (service: ServiceName, value: string | undefined): string => {
    if (useProxy && service !== 'arcade') return PROXY_PATHS[service]
    const v = (value ?? '').trim()
    return (v === '' ? DEFAULT_URLS[service] : v).replace(/\/+$/, '')
  }
  return {
    mode,
    ...(mode === 'replay' ? { replayName: replayName ?? 'mock-demo' } : {}),
    urls: {
      coop: pick('coop', raw.VITE_COOP_API_URL),
      overlay: pick('overlay', raw.VITE_OVERLAY_URL),
      provider: pick('provider', raw.VITE_PROVIDER_API_URL),
      guard: pick('guard', raw.VITE_GUARD_URL),
      agents: pick('agents', raw.VITE_AGENTS_URL),
      arcade: pick('arcade', raw.VITE_ARCADE_URL)
    },
    network: raw.VITE_NETWORK === 'test' ? 'test' : 'main',
    wocTx: raw.VITE_NETWORK === 'test' ? 'https://test.whatsonchain.com/tx/' : 'https://whatsonchain.com/tx/',
    dev
  }
}

/** `http(s)://host/path` or a proxy path → the WebSocket URL of the coordinator feed. */
export function wsUrl (coopUrl: string, loc: { protocol: string, host: string } = location): string {
  if (coopUrl.startsWith('/')) return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}${coopUrl}/ws`
  return `${coopUrl.replace(/^http/, 'ws')}/ws`
}

export const env: AppEnv = resolveEnv(
  import.meta.env as unknown as RawEnv,
  typeof location !== 'undefined' ? location.search : ''
)
