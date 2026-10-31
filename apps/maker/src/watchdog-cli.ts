/**
 * npm run watchdog -w @agentcoop/maker [-- --once]: the refund watchdog on its own (watchdog.ts).
 * Reads data/rail/*.json, asks Arcade for the tip, broadcasts final refunds. No keys needed.
 */
import { join } from 'node:path'
import { fetchChainPolicy } from '@agentcoop/core'
import { arcadeUrl, DATA_DIR } from '../../../scripts/lib/env'
import { flag, run } from '../../../scripts/lib/cli'
import { arcadeBroadcast, fileRecords, startWatchdog, watchOnce } from './watchdog'

run(async () => {
  const arcade = arcadeUrl()
  const dir = join(DATA_DIR, 'rail')
  const deps = { records: fileRecords(dir), tip: async () => (await fetchChainPolicy(arcade)).height, broadcast: arcadeBroadcast(arcade), log: (l: string) => { console.log(l) } }
  if (flag(process.argv.slice(2), '--once')) {
    const r = await watchOnce(deps)
    console.log(`${dir}: ${r.sent.length} refund(s) sent, ${r.failed.length} refused`)
    return
  }
  console.log(`watching ${dir} (Arcade ${arcade}) every 60 s`)
  startWatchdog(deps)
  await new Promise(() => {})
})
