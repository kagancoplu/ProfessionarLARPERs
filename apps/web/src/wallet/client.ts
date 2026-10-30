/**
 * Wallet connection (track-E 0.6, guide §4). `WalletClient('auto')` in the browser: BSV Desktop
 * identifies the app by the page origin; the private key never leaves the wallet. The same
 * controller drives the mock Desktop in mock mode (same WalletInterface surface).
 */
import { WalletClient } from '@bsv/sdk'
import type { EventBus } from '../events/bus'
import { makeEvent } from '../events/types'
import { t } from '../i18n/t'
import type { AppStoreApi } from '../store'
import { describeWalletError } from './errors'
import type { WalletFactory, WalletInterface } from './types'

export const realWalletFactory: WalletFactory = () => new WalletClient('auto')

export interface WalletControllerOptions {
  store: AppStoreApi
  bus: EventBus
  factory: WalletFactory
  expectedNetwork: 'main' | 'test'
  timeoutMs?: number
}

export function withTimeout<T> (p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms)
    p.then(v => { clearTimeout(timer); resolve(v) }, e => { clearTimeout(timer); reject(e) })
  })
}

export class WalletController {
  private current: WalletInterface | undefined
  private connecting: Promise<void> | undefined

  constructor (private readonly opts: WalletControllerOptions) {}

  get wallet (): WalletInterface | undefined { return this.current }

  /** Idempotent: a second call while connecting returns the same promise. */
  connect (): Promise<void> {
    if (this.connecting !== undefined) return this.connecting
    this.connecting = this.doConnect().finally(() => { this.connecting = undefined })
    return this.connecting
  }

  private async doConnect (): Promise<void> {
    const { store, bus, timeoutMs = 20_000 } = this.opts
    store.getState().setMe({ status: 'connecting', error: undefined })
    try {
      const wallet = this.opts.factory()
      await withTimeout(wallet.waitForAuthentication({}), timeoutMs, 'BSV Desktop')
      const { network } = await withTimeout(wallet.getNetwork({}), timeoutMs, 'getNetwork')
      const { publicKey } = await withTimeout(wallet.getPublicKey({ identityKey: true }), timeoutMs, 'getPublicKey')
      this.current = wallet
      bus.publish(makeEvent('web', 'wallet_connected', { identityKey: publicKey, network }, { agent: publicKey }))
      const expected = this.opts.expectedNetwork === 'main' ? 'mainnet' : 'testnet'
      if (network !== expected) store.getState().pushToast({ kind: 'warn', text: t('wallet.networkMismatch', { wallet: network, expected }) })
    } catch (err) {
      this.current = undefined
      const message = describeWalletError(err)
      store.getState().setMe({ status: 'error', error: message })
      throw new Error(message)
    }
  }

  disconnect (): void {
    this.current = undefined
    this.opts.bus.publish(makeEvent('web', 'wallet_disconnected', {}))
  }
}
