/**
 * `npm run provider-cli -- <command>`: the provider operator's CLI on BSV Desktop.
 *
 *   whoami
 *   mint --sym GPUMIN --amt 100000 --dec 0 [--product gpu-h100]
 *   open-pool --credits 1000 --price 25000 --deadline +144 --fee 100 --label "8×H100 · 1 week" [--min 10] [--product gpu-h100]
 *   post-offer <poolId>   register a signed offer with the coordinator again
 *   cancel-pool <poolId>
 *   list-pools
 *   sync-revenue      track pledge fees and settlement payments (from the overlay) in the revenue basket
 *   sweep-revenue     move the revenue basket into the wallet balance
 *
 * BSV Desktop must be running and unlocked; it asks to approve each action.
 * Env: APP_ORIGINATOR (default agentcoop.local), OVERLAY_URL, COOP_API_URL,
 * PROVIDER_API_URL, NETWORK, ARCADE_URL, DATA_DIR.
 */
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { WalletClient } from '@agentcoop/core/sdk'
import { COOP_SERVICE, COOP_TOPIC, OverlayClient } from '@agentcoop/core'
import { dataDir, loadDotEnv, network } from '@agentcoop/core/node/env'
import { cancelPool, listPools, mint, openPool, postOffer, sweepRevenue, syncRevenue, whoami, type CliContext } from './commands'
import { PoolRegistry } from './pools'

loadDotEnv()

const USAGE = `usage: provider-cli <whoami|mint|open-pool|post-offer|cancel-pool|list-pools|sync-revenue|sweep-revenue> [options]
  mint        --sym GPUMIN --amt 100000 --dec 0 [--product gpu-h100]
  open-pool   --credits 1000 --price 25000 --deadline +144 --fee 100 --label "8×H100 · 1 week" [--min 10] [--product gpu-h100]
  post-offer  <poolId>
  cancel-pool <poolId>`

async function main (): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      sym: { type: 'string' },
      amt: { type: 'string' },
      dec: { type: 'string', default: '0' },
      product: { type: 'string', default: 'gpu-h100' },
      credits: { type: 'string' },
      price: { type: 'string' },
      deadline: { type: 'string', default: '+144' },
      fee: { type: 'string', default: '100' }, // registration fee (sats); 100 keeps small pledges cheaper than retail
      min: { type: 'string', default: '1' },
      label: { type: 'string' }
    }
  })
  const [command, arg] = positionals
  if (command === undefined) { console.log(USAGE); return }

  // WALLET_SUBSTRATE pins the BSV Desktop transport (e.g. 'json-api' = http://localhost:3321).
  // 'auto' probes every substrate and can trip on the self-signed https://localhost:2121 one.
  const substrate = (process.env.WALLET_SUBSTRATE as ConstructorParameters<typeof WalletClient>[0] | undefined) ?? 'auto'
  const wallet = new WalletClient(substrate, process.env.APP_ORIGINATOR ?? 'agentcoop.local')
  console.log('Connecting to BSV Desktop…')
  await wallet.waitForAuthentication({})
  const ctx: CliContext = {
    wallet,
    overlay: new OverlayClient(process.env.OVERLAY_URL ?? 'http://localhost:8080', undefined, network(), process.env.ARCADE_URL, COOP_TOPIC, COOP_SERVICE),
    coopApiUrl: process.env.COOP_API_URL ?? 'http://localhost:8090',
    providerApiUrl: process.env.PROVIDER_API_URL ?? 'http://localhost:8092',
    pools: new PoolRegistry(join(dataDir(), 'provider-cli', 'pools.json')),
    out: line => { console.log(line) }
  }
  const need = (v: string | undefined, flag: string): string => { if (v === undefined) throw new Error(`${flag} is required\n${USAGE}`); return v }

  switch (command) {
    case 'whoami': await whoami(ctx); break
    case 'mint':
      await mint(ctx, { sym: need(values.sym, '--sym'), amt: BigInt(need(values.amt, '--amt')), dec: Number(values.dec), product: values.product! })
      break
    case 'open-pool':
      await openPool(ctx, {
        product: values.product!,
        credits: Number(need(values.credits, '--credits')),
        priceSats: Number(need(values.price, '--price')),
        deadline: values.deadline!,
        feeSats: Number(values.fee),
        minCredits: Number(values.min),
        label: need(values.label, '--label')
      })
      break
    case 'post-offer': await postOffer(ctx, need(arg, '<poolId>')); break
    case 'cancel-pool': await cancelPool(ctx, need(arg, '<poolId>')); break
    case 'list-pools': await listPools(ctx); break
    case 'sync-revenue': await syncRevenue(ctx); break
    case 'sweep-revenue': await sweepRevenue(ctx); break
    default: throw new Error(`unknown command ${command}\n${USAGE}`)
  }
}

main().catch(e => { console.error(`error: ${(e as Error).message}`); process.exit(1) })
