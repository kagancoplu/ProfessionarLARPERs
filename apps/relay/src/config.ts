/** Relay settings from the environment (root .env via infra/run.mjs). Error messages name variables, never values. */
export interface RelayConfig {
  supabaseUrl: string
  supabaseSecretKey: string
  urls: { coop: string, overlay: string, guard: string, provider: string, agents: string, maker: string, arcade: string }
}

// the .env.example defaults (MASTER §3.9)
const DEFAULTS: Record<keyof RelayConfig['urls'], [string, string]> = {
  coop: ['COOP_API_URL', 'http://localhost:8090'],
  overlay: ['OVERLAY_URL', 'http://localhost:8080'],
  guard: ['GUARD_URL', 'http://localhost:8091'],
  provider: ['PROVIDER_API_URL', 'http://localhost:8092'],
  agents: ['AGENTS_URL', 'http://localhost:8093'],
  maker: ['MAKER_URL', 'http://localhost:8094'],
  arcade: ['ARCADE_URL', 'https://arcade-v2-us-1.bsvblockchain.tech']
}

export function loadConfig (env: NodeJS.ProcessEnv): RelayConfig {
  const need = (name: string): string => {
    const v = env[name]?.trim() ?? ''
    if (v === '') throw new Error(`${name} is not set (root .env); the relay needs the Supabase project URL and its secret key`)
    return v
  }
  const supabaseUrl = need('SUPABASE_URL')
  const supabaseSecretKey = need('SUPABASE_SECRET_KEY')
  const urls = Object.fromEntries(Object.entries(DEFAULTS).map(([k, [name, dflt]]) => {
    const v = env[name]?.trim() ?? ''
    return [k, (v === '' ? dflt : v).replace(/\/+$/, '')]
  })) as RelayConfig['urls']
  return { supabaseUrl, supabaseSecretKey, urls }
}
