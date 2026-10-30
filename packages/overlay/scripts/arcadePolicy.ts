/**
 * Validation test 8: Arcade policy vs. settlement size. `npm run arcade-policy`
 *
 * Reads GET {ARCADE_URL}/health, summarises the strictest policy across the
 * datahubs, and prints the settlement size and fee for several participant
 * counts using the measured size model (scripts/settlementSize.ts).
 */
import { feeSats, settlementBytes } from './settlementSize'

interface Policy { miningFee?: { satoshis: number, bytes: number }, maxtxsizepolicy?: number, maxscriptsizepolicy?: number }
interface Health { healthy: boolean, version: string, blockHeight: number, datahub_urls?: Array<{ url: string, healthy: boolean, policy?: Policy }> }

const arcadeUrl = process.env.ARCADE_URL ?? 'https://arcade-v2-us-1.bsvblockchain.tech'

const res = await fetch(`${arcadeUrl}/health`)
if (!res.ok) {
  console.error(`Arcade /health failed: ${res.status}`)
  process.exit(1)
}
const health = await res.json() as Health
const policies = (health.datahub_urls ?? []).filter(d => d.healthy && d.policy !== undefined).map(d => d.policy!)
const rates = policies.map(p => p.miningFee !== undefined ? p.miningFee.satoshis * 1000 / p.miningFee.bytes : NaN).filter(Number.isFinite)
const maxRate = Math.max(...rates)
const minRate = Math.min(...rates)
const maxTx = Math.min(...policies.map(p => p.maxtxsizepolicy ?? Infinity))
const maxScript = Math.min(...policies.map(p => p.maxscriptsizepolicy ?? Infinity))

console.log(`Arcade ${arcadeUrl} ${health.version} healthy=${health.healthy} height=${health.blockHeight}`)
console.log(`datahubs with policy: ${policies.length}; fee ${minRate}–${maxRate} sat/kB; strictest maxtxsize ${maxTx} B; strictest maxscriptsize ${maxScript} B`)
console.log('')
console.log('participants (p2pkh+vault) | bytes  | fee @max rate | fee @min rate | fee/participant @max | fits policy')
for (const [p2pkh, vault] of [[2, 0], [3, 0], [20, 0], [50, 0], [100, 0], [40, 10], [80, 20]]) {
  const bytes = settlementBytes({ p2pkh, vault, amtDigits: 4 })
  const n = p2pkh + vault
  const fee = feeSats(bytes, maxRate)
  console.log(`${String(`${p2pkh}+${vault}`).padEnd(26)} | ${String(bytes).padEnd(6)} | ${String(fee).padEnd(13)} | ${String(feeSats(bytes, minRate)).padEnd(13)} | ${String(Math.ceil(fee / n)).padEnd(20)} | ${bytes <= maxTx}`)
}
