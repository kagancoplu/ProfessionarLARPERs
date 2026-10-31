/**
 * `npm run provider`: the simulated GPU provider API.
 *
 * Env (.env, MASTER §3.9): WALLET_PROVIDER_API_KEY (64 hex, required),
 * PROVIDER_API_URL (port taken from it; default http://localhost:8092),
 * OVERLAY_URL (credit tokens), NETWORK, ARCADE_URL, COOP_API_URL, DATA_DIR.
 *
 * State in <DATA_DIR>: wallets/provider-api.sqlite, provider/jobs.json,
 * provider/balances.json (prepaid credits), provider/outbox.json (overlay queue),
 * provider/replay/ (402 payments already taken, shared by every process on this host: T-17).
 */
import { createServer } from 'node:http'
import { join } from 'node:path'
import { dataDir, loadDotEnv, network, requireEnv } from '@agentcoop/core/node/env'
import { openServerWallet } from '@agentcoop/core/node/serverWallet'
import { COOP_SERVICE, COOP_TOPIC, OverlayClient, type OutboxItem } from '@agentcoop/core'
import { createProviderApp } from './app'
import { CreditLedger } from './credits'
import { JsonFile } from './jsonFile'
import { FileReplayStore } from './replayStore'
import { loadProducts, refreshTokenIds } from './products'
import { JobRunner } from './runner'

loadDotEnv()
const data = dataDir()
const apiUrl = new URL(process.env.PROVIDER_API_URL ?? 'http://localhost:8092')
const port = Number(process.env.PORT ?? (apiUrl.port || 8092))

const { wallet, identityKey, close } = await openServerWallet({
  name: 'provider-api',
  rootKeyHex: requireEnv('WALLET_PROVIDER_API_KEY'),
  dataDir: data,
  chain: network(),
  arcadeUrl: process.env.ARCADE_URL
})
const products = loadProducts()
const runner = new JobRunner({ products, file: join(data, 'provider', 'jobs.json') })
const ledger = new CreditLedger(join(data, 'provider', 'balances.json'))
const outbox = new JsonFile<OutboxItem[]>(join(data, 'provider', 'outbox.json'), () => [])
const overlay = new OverlayClient(
  process.env.OVERLAY_URL ?? 'http://localhost:8080',
  { load: () => outbox.read(), save: items => { outbox.write(items) } },
  network(),
  process.env.ARCADE_URL,
  COOP_TOPIC,
  COOP_SERVICE
)
const replayStore = new FileReplayStore(join(data, 'provider', 'replay'))
const app = createProviderApp({ wallet, products, runner, ledger, overlay, replayStore, coopApiUrl: process.env.COOP_API_URL, arcadeUrl: process.env.ARCADE_URL, corsOrigin: process.env.PROVIDER_CORS_ORIGIN })

// BRC-105 payments travel in a header as BEEF with every unconfirmed ancestor: an agent paying every
// ~30 s between blocks outgrows Node's 16 KB default and got "431 Request Header Fields Too Large"
// after it had already paid (mainnet, 31.10). 1 MB.
const server = createServer({ maxHeaderSize: 1_048_576 }, app).listen(port, () => {
  console.log(`provider-api on http://localhost:${port}  (server identity ${identityKey}, ${network()}net, overlay ${overlay.url})`)
  for (const p of products) console.log(`  ${p.id}: ${p.label}, ${p.retailSatsPerCredit} sat/${p.unit} retail, token ${p.tokenId ?? '(not minted yet)'}`)
})

// `provider-cli mint` writes the token id to products/*.json; serve it without a restart.
const tokenWatch = setInterval(() => {
  try {
    for (const p of refreshTokenIds(products)) console.log(`  ${p.id}: credit token is now ${p.tokenId ?? '(none)'}`)
  } catch (e) {
    console.log(`  products: reload failed (${(e as Error).message}); keeping the loaded token ids`)
  }
}, 5000)
tokenWatch.unref()

const shutdown = async (): Promise<void> => {
  clearInterval(tokenWatch)
  runner.stop()
  server.close()
  await close()
  process.exit(0)
}
process.on('SIGINT', () => { void shutdown() })
process.on('SIGTERM', () => { void shutdown() })
