import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config'

const SECRET = 'sb_secret_value_that_must_not_leak'

describe('loadConfig', () => {
  it('requires SUPABASE_URL and SUPABASE_SECRET_KEY and names the missing one without printing values', () => {
    expect(() => loadConfig({ SUPABASE_SECRET_KEY: SECRET })).toThrow(/SUPABASE_URL/)
    let message = ''
    try { loadConfig({ SUPABASE_URL: 'https://ref.supabase.co' }) } catch (err) { message = (err as Error).message }
    expect(message).toMatch(/SUPABASE_SECRET_KEY/)
    try { loadConfig({ SUPABASE_URL: '', SUPABASE_SECRET_KEY: SECRET }) } catch (err) { message = (err as Error).message }
    expect(message).not.toContain(SECRET)
  })

  it('defaults the service URLs to the .env.example values', () => {
    const c = loadConfig({ SUPABASE_URL: 'https://ref.supabase.co', SUPABASE_SECRET_KEY: SECRET })
    expect(c.urls).toEqual({
      coop: 'http://localhost:8090',
      overlay: 'http://localhost:8080',
      guard: 'http://localhost:8091',
      provider: 'http://localhost:8092',
      agents: 'http://localhost:8093',
      maker: 'http://localhost:8094',
      arcade: 'https://arcade-v2-us-1.bsvblockchain.tech'
    })
    expect(loadConfig({ SUPABASE_URL: 'u', SUPABASE_SECRET_KEY: SECRET, COOP_API_URL: 'http://coop:9000/' }).urls.coop).toBe('http://coop:9000')
  })
})
