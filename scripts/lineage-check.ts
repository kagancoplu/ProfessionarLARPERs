/**
 * Verification test 7 (FINAL-IDEA §12.1): walk a mainnet BSV-21 output back to
 * its deploy with verifyLineage (Arcade, WhatsOnChain fallback), no overlay.
 *
 *   npx tsx scripts/lineage-check.ts <txid_vout>
 */
import { verifyLineage } from '@agentcoop/core'

const outpoint = process.argv[2]
if (outpoint === undefined || !/^[0-9a-f]{64}[_.]\d+$/.test(outpoint)) {
  console.error('usage: npx tsx scripts/lineage-check.ts <txid_vout>')
  process.exit(2)
}
const started = Date.now()
const r = await verifyLineage(outpoint, { arcadeUrl: process.env.ARCADE_URL })
console.log(JSON.stringify({ outpoint, ...r, amt: r.amt?.toString(), ms: Date.now() - started }, null, 2))
process.exit(r.ok ? 0 : 1)
