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
