/**
 * Server wallets (wallet-toolbox, SQLite) with Arcade as the primary
 * broadcaster (guide §14.2). One file per wallet: data/wallets/<name>.sqlite.
 *
 *   const { wallet, identityKey, close } = await openWallet('agent-1')
 *
 * The key comes from .env (WALLET_<NAME>_KEY, see scripts/keygen.ts).
 * Long-running services pass { startMonitor: true } so proofs and rebroadcasts
 * are tracked; one-shot scripts leave it off.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { CachedKeyDeriver, PrivateKey } from '@agentcoop/core/sdk'
import { Monitor, Services, Setup, StorageKnex, Wallet, WalletStorageManager } from '@bsv/wallet-toolbox'
import { DATA_DIR, WALLET_NAMES, arcadeUrl, chain, requireKey } from './lib/env'

export { WALLET_NAMES }

export interface OpenWalletOptions {
  /** Start the wallet-toolbox monitor (proof tracking, rebroadcasts). Default: false. */
  startMonitor?: boolean
  /** Directory for the SQLite file. Default: <repo>/data/wallets. */
  dir?: string
}

export interface OpenedWallet {
  name: string
  wallet: Wallet
  identityKey: string
  monitor: Monitor
  close: () => Promise<void>
}

export async function openWallet (name: string, opts: OpenWalletOptions = {}): Promise<OpenedWallet> {
  const rootKey = PrivateKey.fromHex(requireKey(name))
  const identityKey = rootKey.toPublicKey().toString()
  const c = chain()

  const options = Services.createDefaultOptions(c)
  options.arcadeUrl = arcadeUrl()
  const services = new Services(options) // broadcast order: Arcade, GorillaPool, TAAL, Bitails, WhatsOnChain

  const dir = opts.dir ?? join(DATA_DIR, 'wallets')
  mkdirSync(dir, { recursive: true })
  const storage = new StorageKnex({ ...StorageKnex.createStorageBaseOptions(c), knex: Setup.createSQLiteKnex(join(dir, `${name}.sqlite`)) })
  await storage.migrate(`agentcoop ${name}`, identityKey)
  await storage.makeAvailable()
  const manager = new WalletStorageManager(identityKey, storage)
  await manager.makeAvailable()
  manager.setServices(services)

  const monitor = new Monitor(Monitor.createDefaultWalletMonitorOptions(c, manager, services))
  monitor.addDefaultTasks()
  const wallet = new Wallet({ chain: c, keyDeriver: new CachedKeyDeriver(rootKey), storage: manager, services, monitor })
  if (opts.startMonitor === true) void monitor.startTasks()

  return {
    name,
    wallet,
    identityKey,
    monitor,
    close: async () => {
      monitor.stopTasks()
      await wallet.destroy()
    }
  }
}
