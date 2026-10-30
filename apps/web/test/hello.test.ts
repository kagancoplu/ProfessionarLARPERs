import { describe, expect, it } from 'vitest'
import { Utils } from '@bsv/sdk'
import { coordinatorHost, helloData, signHello } from '../src/wallet/hello'

describe('coordinator hello proof (B-P5a)', () => {
  it('signs "agentcoop hello\\n<host>\\n<nonce>" with [1,"agentcoop hello"], keyID 1, counterparty anyone', async () => {
    expect(Utils.toUTF8(helloData('Localhost:8090', 'abc'))).toBe('agentcoop hello\nlocalhost:8090\nabc')
    const calls: unknown[] = []
    const sig = await signHello({ createSignature: async (args: unknown) => { calls.push(args); return { signature: [1, 2, 255] } } }, 'localhost:5173', 'n0nce')
    expect(sig).toBe('0102ff')
    expect(calls[0]).toMatchObject({ protocolID: [1, 'agentcoop hello'], keyID: '1', counterparty: 'anyone' })
  })
  it('binds the host to the proxy (browser host) or the coordinator URL', () => {
    expect(coordinatorHost('/api/coop', { host: 'localhost:5173' })).toBe('localhost:5173')
    expect(coordinatorHost('https://coop.example.com:8443', { host: 'x' })).toBe('coop.example.com:8443')
  })
})
