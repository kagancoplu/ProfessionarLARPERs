/**
 * `npm run participant-cli -- <command>`: join a pool yourself from BSV Desktop.
 *
 *   pools                          open pools (coordinator GET /pools)
 *   pledge <poolId> <credits>      reserve a pledge coin in your wallet (T3)
 *   sign [poolId]                  stay online; when the pool fills, check the whole
 *                                  settlement and sign your input (T5), then take your credits
 *   cancel [outpoint]              withdraw a pledge (the coin comes back)
 *
 * BSV Desktop must be running and unlocked; it asks to approve every signature.
 * Env: APP_ORIGINATOR, OVERLAY_URL, COOP_API_URL, NETWORK, ARCADE_URL, DATA_DIR.
 */
import { join } from 'node:path'
import { WalletClient } from '@agentcoop/core/sdk'
import { COOP_SERVICE, COOP_TOPIC, OverlayClient } from '@agentcoop/core'
import { dataDir, loadDotEnv, network } from '@agentcoop/core/node/env'
import { JsonFile } from '../../provider-api/src/jsonFile'
import type { ActivePledge } from '../../agents/src/participant'
import { cancel, pledge, pools, sign, type ParticipantContext } from './commands'

loadDotEnv()
const USAGE = 'usage: participant-cli <pools | pledge <poolId> <credits> | sign [poolId] | cancel [outpoint]>'

async function main (): Promise<void> {
  const [command, a, b] = process.argv.slice(2)
  if (command === undefined) { console.log(USAGE); return }
  const wallet = new WalletClient('auto', process.env.APP_ORIGINATOR ?? 'agentcoop.local')
  console.log('Connecting to BSV Desktop…')
  await wallet.waitForAuthentication({})
  const ctx: ParticipantContext = {
    wallet,
    overlay: new OverlayClient(process.env.OVERLAY_URL ?? 'http://localhost:8080', undefined, network(), process.env.ARCADE_URL, COOP_TOPIC, COOP_SERVICE),
    coopApiUrl: process.env.COOP_API_URL ?? 'http://localhost:8090',
    pledges: new JsonFile<ActivePledge[]>(join(dataDir(), 'participant-cli', 'pledges.json'), () => []),
    out: line => { console.log(line) }
  }
  switch (command) {
    case 'pools': await pools(ctx); break
    case 'pledge':
      if (a === undefined || b === undefined) throw new Error(USAGE)
      await pledge(ctx, a, Number(b))
      break
    case 'sign': await sign(ctx, { poolId: a }); break
    case 'cancel': await cancel(ctx, a); break
    default: throw new Error(`unknown command ${command}\n${USAGE}`)
  }
}

main().catch(e => { console.error(`error: ${(e as Error).message}`); process.exit(1) })
