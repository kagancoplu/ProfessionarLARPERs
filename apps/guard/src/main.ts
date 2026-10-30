/**
 * npm run guard → the guard server on GUARD_URL's port (default 8091).
 * Wallet: WALLET_GUARD_KEY via scripts/wallets.ts (openWallet). State: data/guard/.
 */
import { join } from 'node:path'
import { DATA_DIR, chain } from '../../../scripts/lib/env'
import { openWallet } from '../../../scripts/wallets'
import { Guard } from './guard'
import { createGuardApp } from './server'
import { GuardStore } from './store'

async function main (): Promise<void> {
  const url = new URL(process.env.GUARD_URL ?? 'http://localhost:8091')
  const port = Number(url.port === '' ? 8091 : url.port)
  const { wallet, identityKey } = await openWallet('guard')
  const guard = await Guard.create({ wallet, store: new GuardStore(join(DATA_DIR, 'guard')) })
  createGuardApp(guard, wallet, { network: chain() }).listen(port, () => {
    console.log(`[guard] listening on :${port} · identity ${identityKey} · network ${chain()} · state ${join(DATA_DIR, 'guard')}`)
  })
}

main().catch(e => { console.error(`[guard] ${(e as Error).message}`); process.exit(1) })
