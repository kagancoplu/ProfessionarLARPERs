/** D-P0 §8 scenarios 7–8: key lines for .env. */
import { describe, expect, it } from 'vitest'
import { PrivateKey } from '@agentcoop/core/sdk'
import { WALLET_NAMES, keyVar } from '../scripts/lib/env'
import { generateKeyLines } from '../scripts/lib/keys'

describe('keygen', () => {
  it('7. one 64-hex key per server wallet of MASTER-PLAN §3.9, all different', () => {
    const { lines, skipped } = generateKeyLines(WALLET_NAMES)
    expect(skipped).toEqual([])
    expect(lines.map(l => l.split('=')[0])).toEqual([
      'WALLET_PROVIDER_API_KEY', 'WALLET_COORDINATOR_KEY', 'WALLET_GUARD_KEY',
      'WALLET_AGENT_1_KEY', 'WALLET_AGENT_2_KEY', 'WALLET_AGENT_3_KEY', 'WALLET_MAKER_KEY'
    ])
    const keys = lines.map(l => l.split('=')[1])
    for (const k of keys) {
      expect(k).toMatch(/^[0-9a-f]{64}$/)
      expect(PrivateKey.fromHex(k).toHex()).toBe(k) // round-trips, no lost leading zeros
    }
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('8. --only-missing skips wallets that already have a key', () => {
    const { lines, skipped } = generateKeyLines(WALLET_NAMES, name => name === 'agent-1' || name === 'guard')
    expect(skipped).toEqual(['guard', 'agent-1'])
    expect(lines.map(l => l.split('=')[0])).not.toContain(keyVar('agent-1'))
    expect(lines).toHaveLength(5)
  })
})
