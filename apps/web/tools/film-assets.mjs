#!/usr/bin/env node
/**
 * What the app tour shows that does not live in the app (VIDEO.md), into public/_film/ (not committed):
 *   tx-settlement.json, tx-sweep.json   the two mainnet transactions, from the WhatsOnChain API
 *   pool-last.png                       the last frame of film-out/pool.mp4 (the tour shrinks it into the Town)
 * Screenshots of the real WhatsOnChain pages can be dropped in as woc-settlement.png / woc-sweep.png: the tour
 * shows those instead of its own card (the site's bot check blocks a headless browser, so this cannot fetch them).
 * Run: node tools/film-assets.mjs   (behind a proxy: NODE_USE_ENV_PROXY=1)
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const out = resolve(process.cwd(), 'public/_film')
await mkdir(out, { recursive: true })
const TXS = { settlement: '6d320c9af886bd2514da2c4af0ed0c64477840e08564fb8b8e381270aa5b2763', sweep: '675c33341427325ac458c40e1a0e35ba25995b4ca3653297ca1fe1348ee7231c' }
for (const [name, txid] of Object.entries(TXS)) {
  const res = await fetch(`https://api.whatsonchain.com/v1/bsv/main/tx/hash/${txid}`)
  if (!res.ok) throw new Error(`WhatsOnChain API ${res.status} for ${name}`)
  const tx = await res.json()
  await writeFile(resolve(out, `tx-${name}.json`), JSON.stringify(tx) + '\n')
  console.log(`tx-${name}.json · ${tx.vin.length} in, ${tx.vout.length} out, block ${tx.blockheight}`)
}
const film = resolve(process.cwd(), 'film-out/pool.mp4')
if (existsSync(film)) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-sseof', '-0.1', '-i', film, '-frames:v', '1', '-update', '1', resolve(out, 'pool-last.png')])
  console.log('pool-last.png from film-out/pool.mp4')
} else console.warn('no film-out/pool.mp4 yet: render it first (npm run film:render), then run this again')
