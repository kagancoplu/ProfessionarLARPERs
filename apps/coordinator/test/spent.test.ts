/**
 * WhatsOnChain spent check: only a real spending txid blacklists a pledge coin.
 * Mainnet 31.10: a pledge seconds old came back as "spent on chain" and was
 * blacklisted although it was not; an error or empty spentIn is now "unknown".
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WocSpentChecker } from '../src/spent'

const A = `${'aa'.repeat(32)}_0`
const B = `${'bb'.repeat(32)}_1`
const C = `${'cc'.repeat(32)}_0`
const D = `${'dd'.repeat(32)}_2`

afterEach(() => { vi.unstubAllGlobals() })

describe('WocSpentChecker', () => {
  it('spent only with a spending txid; errors and empty answers are unknown', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      { utxo: { txid: 'aa'.repeat(32), vout: 0 }, spentIn: { txid: 'ee'.repeat(32), vin: 1 } },
      { utxo: { txid: 'bb'.repeat(32), vout: 1 }, error: '' },
      { utxo: { txid: 'cc'.repeat(32), vout: 0 }, error: 'unknown', spentIn: { txid: '' } },
      { utxo: { txid: 'dd'.repeat(32), vout: 2 }, spentIn: { txid: '' } }
    ]), { status: 200 })))
    const r = await new WocSpentChecker('main').spent([A, B, C, D])
    expect(r.get(A)).toBe(true)
    expect(r.get(B)).toBe(false)
    expect(r.has(C)).toBe(false) // unknown → treated as unspent by the engine
    expect(r.get(D)).toBe(false)
  })
})
