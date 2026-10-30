/** D-P3: the maker's quote endpoint and event stream (Track E's harbour scene). */
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { createMakerApp, MakerEvents } from '../src/server'

describe('maker HTTP', () => {
  it('GET /quote prices USDC → sats with the spread and emits rail_quote; limits and direction are enforced', async () => {
    const events = new MakerEvents()
    const app = createMakerApp({ satsPerUsdc: 2_000, maxUsdc: 1_000_000n, makerEvm: '0x000000000000000000000000000000000000BA5E', makerBsv: '02'.padEnd(66, '1'), network: { evm: 'base-sepolia', bsv: 'main' } }, events)
    const server = app.listen(0)
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    try {
      const q = await (await fetch(`${url}/quote?dir=usdc-bsv&amount=500000`)).json()
      expect(q).toMatchObject({ usdc: '500000', sats: 985, spreadBps: 150, terms: { hash: 'sha256', bsvRefundBlocks: 6 } })
      expect((await fetch(`${url}/quote?amount=2000000`)).status).toBe(400)
      expect((await fetch(`${url}/quote?dir=bsv-usdc&amount=1`)).status).toBe(400)
      expect(events.buffer.map(e => [e.type, e.data.sats])).toEqual([['rail_quote', 985]])
    } finally { server.close() }
  })
})
