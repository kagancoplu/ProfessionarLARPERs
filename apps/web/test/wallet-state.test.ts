import { describe, expect, it } from 'vitest'
import { createBus } from '../src/events/bus'
import { MOCK_IDS } from '../src/mock/data'
import { createMockWallet } from '../src/mock/wallet'
import { createAppStore } from '../src/store'
import { DEFAULT_SETTINGS } from '../src/store/types'
import { WalletController } from '../src/wallet/client'
import { classifyWalletError, describeWalletError } from '../src/wallet/errors'
import type { WalletInterface } from '../src/wallet/types'

const setup = (factory: () => WalletInterface, expectedNetwork: 'main' | 'test' = 'main') => {
  const store = createAppStore('mock', undefined, { ...DEFAULT_SETTINGS })
  const bus = createBus(store)
  return { store, ctrl: new WalletController({ store, bus, factory, expectedNetwork, timeoutMs: 200 }) }
}

describe('WalletController', () => {
  it('connects: identity and network land in me, a wallet_connected event is published', async () => {
    const { store, ctrl } = setup(() => createMockWallet({ identityKey: MOCK_IDS.me, delayMs: 0, autoApprove: true }))
    const p = ctrl.connect()
    expect(store.getState().me.status).toBe('connecting')
    await p
    expect(store.getState().me).toMatchObject({ status: 'connected', identityKey: MOCK_IDS.me, network: 'mainnet' })
    expect(store.getState().feed.at(-1)?.type).toBe('wallet_connected')
    expect(ctrl.wallet).toBeDefined()
    ctrl.disconnect()
    expect(store.getState().me.status).toBe('idle')
  })
  it('warns on a network mismatch but still connects', async () => {
    const { store, ctrl } = setup(() => createMockWallet({ identityKey: MOCK_IDS.me, delayMs: 0, network: 'testnet' }))
    await ctrl.connect()
    expect(store.getState().me.network).toBe('testnet')
    expect(store.getState().ui.toasts.at(-1)?.text).toContain('testnet')
  })
  it('times out when BSV Desktop never answers, with a human sentence', async () => {
    const never = { waitForAuthentication: () => new Promise(() => {}) } as unknown as WalletInterface
    const { store, ctrl } = setup(() => never)
    await expect(ctrl.connect()).rejects.toThrow(/did not answer in time/)
    expect(store.getState().me).toMatchObject({ status: 'error', error: 'BSV Desktop did not answer in time.' })
  })
  it('translates Desktop errors', () => {
    expect(classifyWalletError(new Error('Failed to fetch'))).toBe('unreachable')
    expect(classifyWalletError(new Error('User rejected the request'))).toBe('rejected')
    expect(describeWalletError(new Error('User rejected the request'))).toBe('You declined in BSV Desktop. Nothing was sent.')
    expect(describeWalletError(new Error('weird'))).toContain('weird')
  })
})
