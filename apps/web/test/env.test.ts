import { describe, expect, it } from 'vitest'
import { resolveEnv, wsUrl } from '../src/env'

describe('resolveEnv', () => {
  it('defaults to live with the MASTER §3.9 localhost URLs', () => {
    const e = resolveEnv({})
    expect(e.mode).toBe('live')
    expect(e.urls.coop).toBe('http://localhost:8090')
    expect(e.urls.arcade).toBe('https://arcade-v2-us-1.bsvblockchain.tech')
    expect(e.network).toBe('main')
  })
  it('a deployed live build without service URLs runs the mock walkthrough (no dead page on Vercel)', () => {
    const host = 'professionar-larpe-rs.vercel.app'
    const e = resolveEnv({}, '', host)
    expect(e.mode).toBe('mock')
    expect(e.unconfigured).toBe(true)
    // configured, explicitly live, the Supabase mirror alone, or served locally: stays live
    expect(resolveEnv({ VITE_COOP_API_URL: 'https://coop.example' }, '', host).mode).toBe('live')
    expect(resolveEnv({}, '?mode=live', host).mode).toBe('live')
    expect(resolveEnv({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' }, '', host).mode).toBe('live')
    expect(resolveEnv({}, '', 'localhost:4173').mode).toBe('live')
    expect(resolveEnv({}, '?replay=mock-demo', host).mode).toBe('replay')
  })
  it('uses the dev proxy paths under vite dev', () => {
    const e = resolveEnv({ DEV: true, VITE_COOP_API_URL: 'http://example:1' })
    expect(e.urls.coop).toBe('/api/coop')
    expect(e.urls.arcade).toBe('https://arcade-v2-us-1.bsvblockchain.tech')
    expect(resolveEnv({ DEV: true, VITE_USE_PROXY: 'false', VITE_COOP_API_URL: 'http://example:1/' }).urls.coop).toBe('http://example:1')
  })
  it('mode priority: ?mode > ?replay > --mode mock > VITE_DATA_MODE', () => {
    expect(resolveEnv({ MODE: 'mock' }).mode).toBe('mock')
    expect(resolveEnv({ VITE_DATA_MODE: 'mock' }).mode).toBe('mock')
    expect(resolveEnv({ MODE: 'mock' }, '?mode=live').mode).toBe('live')
    const r = resolveEnv({}, '?replay=mainnet-1')
    expect(r.mode).toBe('replay')
    expect(r.replayName).toBe('mainnet-1')
    expect(resolveEnv({}, '?mode=mock&replay=x').mode).toBe('mock')
  })
  it('derives the WebSocket URL for proxy paths and absolute URLs', () => {
    expect(wsUrl('/api/coop', { protocol: 'http:', host: 'localhost:5173' })).toBe('ws://localhost:5173/api/coop/ws')
    expect(wsUrl('https://coop.example.com', { protocol: 'https:', host: 'x' })).toBe('wss://coop.example.com/ws')
  })
})

describe('transport (plan/phases/SUPABASE-MVP.md)', () => {
  const sb = { VITE_SUPABASE_URL: 'https://ref.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' }
  it('picks supabase when VITE_SUPABASE_URL and the anon key are set, direct otherwise or with ?transport=direct', () => {
    expect(resolveEnv(sb).transport).toBe('supabase')
    expect(resolveEnv(sb).supabase).toEqual({ url: 'https://ref.supabase.co', key: 'anon' })
    expect(resolveEnv({ VITE_SUPABASE_URL: 'https://ref.supabase.co' }).transport).toBe('direct')
    expect(resolveEnv({}).transport).toBe('direct')
    expect(resolveEnv({ ...sb, VITE_TRANSPORT: 'direct' }).transport).toBe('direct')
    expect(resolveEnv(sb, '?transport=direct').transport).toBe('direct')
  })

  it('mock and replay never use Supabase, even with the keys in .env', () => {
    expect(resolveEnv({ ...sb, MODE: 'mock' }).transport).toBe('direct')
    expect(resolveEnv({ ...sb, MODE: 'mock' }).supabase).toBeUndefined()
    expect(resolveEnv(sb, '?replay=mock-demo').transport).toBe('direct')
  })
})
