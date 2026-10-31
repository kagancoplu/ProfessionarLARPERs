/**
 * npm run watchdog -w @agentcoop/maker [-- --once]: the watchdog on its own (watchdog.ts).
 * Reads data/rail/*.json, asks Arcade for the tip, broadcasts final refunds (no keys needed); with
 * BASE_PRIVATE_KEY and BASE_HTLC_ADDRESS in .env it also claims the USDC of swaps the agent claimed.
 */
import { join } from 'node:path'
import { arcadeTxFetcher, fetchChainPolicy } from '@agentcoop/core'
import { arcadeUrl, chain, DATA_DIR } from '../../../scripts/lib/env'
import { flag, run } from '../../../scripts/lib/cli'
import { arcadeBroadcast, fileRecords, startWatchdog, usdcClaimFromEnv, watchOnce } from './watchdog'

run(async () => {
  const arcade = arcadeUrl()
  const dir = join(DATA_DIR, 'rail')
  const deps = {
    records: fileRecords(dir),
    tip: async () => (await fetchChainPolicy(arcade)).height,
    broadcast: arcadeBroadcast(arcade),
    ...usdcClaimFromEnv(process.env, chain(), arcadeTxFetcher(arcade)), // with BASE_PRIVATE_KEY + BASE_HTLC_ADDRESS
    log: (l: string) => { console.log(l) }
  }
  if (flag(process.argv.slice(2), '--once')) {
    const r = await watchOnce(deps)
    console.log(`${dir}: ${r.sent.length} refund(s) sent, ${r.claimed.length} USDC claim(s), ${r.failed.length} failed`)
    return
  }
  console.log(`watching ${dir} (Arcade ${arcade}) every 60 s`)
  startWatchdog(deps)
  await new Promise(() => {})
})
