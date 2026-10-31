/**
 * Server wallets (wallet-toolbox, SQLite) with Arcade as the primary
 * broadcaster: guide §14.2, as a function. Node-only.
 *
 * Added by Track C for provider-api and agents. Track D's scripts/wallets.ts
 * (`openWallet(name)`, MASTER §6.2) can wrap this.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { CachedKeyDeriver, PrivateKey } from '../sdk'
import { Monitor, Services, Setup, StorageKnex, Wallet, WalletStorageManager } from '@bsv/wallet-toolbox'

import { ARCADE_URL } from '../types'

export interface ServerWalletOptions {
  /** Wallet name: the SQLite file is `<dataDir>/wallets/<name>.sqlite`. */
  name: string
  /** 64 hex chars. Load it from the environment; never log or commit it. */
  rootKeyHex: string
  dataDir: string
  chain?: 'main' | 'test'
  arcadeUrl?: string
  /** Run the monitor's background tasks (proof tracking, rebroadcast). Default true. */
  monitor?: boolean
  /**
   * How many unconfirmed ancestors a transaction's BEEF may carry (wallet-toolbox default 12).
   * An agent paying every ~30 s chains more than 12 unmined transactions between two blocks, and
   * every payment then failed with "Maximum BEEF depth exceeded" (mainnet, 30–31.10). Default 100.
   */
  maxBeefDepth?: number
}

export interface ServerWallet {
  wallet: Wallet
  identityKey: string
  close: () => Promise<void>
}

export async function openServerWallet (opts: ServerWalletOptions): Promise<ServerWallet> {
  const chain = opts.chain ?? 'main'
  const rootKey = PrivateKey.fromHex(opts.rootKeyHex)
  const identityKey = rootKey.toPublicKey().toString()

  const options = Services.createDefaultOptions(chain)
  options.arcadeUrl = opts.arcadeUrl ?? ARCADE_URL
  const services = new Services(options) // broadcast order: Arcade, GorillaPool, TAAL, Bitails, WhatsOnChain

  mkdirSync(join(opts.dataDir, 'wallets'), { recursive: true })
  const knex = Setup.createSQLiteKnex(join(opts.dataDir, 'wallets', `${opts.name}.sqlite`))
  const storage = new StorageKnex({ ...StorageKnex.createStorageBaseOptions(chain), knex })
  await storage.migrate(opts.name, identityKey)
  await storage.makeAvailable()
  storage.maxRecursionDepth = opts.maxBeefDepth ?? 100
  const manager = new WalletStorageManager(identityKey, storage)
  await manager.makeAvailable()
  manager.setServices(services)

  const monitor = new Monitor(Monitor.createDefaultWalletMonitorOptions(chain, manager, services))
  monitor.addDefaultTasks()
  const wallet = new Wallet({ chain, keyDeriver: new CachedKeyDeriver(rootKey), storage: manager, services, monitor })
  // startTasks() resolves when its loop exits; close() waits for that before closing the database.
  const tasks = opts.monitor !== false ? monitor.startTasks().catch(() => {}) : Promise.resolve()

  return {
    wallet,
    identityKey,
    close: async () => {
      monitor.stopTasks()
      await tasks
      await monitor.destroy()
      await wallet.destroy()
    }
  }
}
