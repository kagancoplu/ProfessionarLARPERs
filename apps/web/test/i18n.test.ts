import { describe, expect, it } from 'vitest'
import { en } from '../src/i18n/en'
import { hasKey, t } from '../src/i18n/t'

describe('i18n', () => {
  it('interpolates and never returns an empty string', () => {
    expect(t('wallet.networkMismatch', { wallet: 'testnet', expected: 'mainnet' })).toBe('Your wallet is on testnet; this town runs on mainnet.')
    expect(t('states.serviceDown', { service: 'guard', url: 'x' })).toContain('guard')
    expect(hasKey('nav.town')).toBe(true)
    expect(hasKey('nav.nope')).toBe(false)
  })
  it('every leaf is a non-empty string with no marketing voice', () => {
    const walk = (o: unknown, path: string): void => {
      if (typeof o === 'string') {
        expect(o.trim().length, path).toBeGreaterThan(0)
        expect(/seamless|unlock the power|revolutioni|welcome to/i.test(o), path).toBe(false)
        return
      }
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) walk(v, `${path}.${k}`)
    }
    walk(en, 'en')
  })
})
