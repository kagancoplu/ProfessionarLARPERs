/** A temp copy of apps/provider-api/products with a fast simulator, so tests can mint into it. */
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PRODUCTS_DIR } from '../../apps/provider-api/src/products'

export function tempProductsDir (minutesPerSecond = 3000): string {
  const dir = mkdtempSync(join(tmpdir(), 'agentcoop-products-'))
  cpSync(PRODUCTS_DIR, dir, { recursive: true })
  for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) {
    const p = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    p.simulate.minutesPerSecond = minutesPerSecond
    writeFileSync(join(dir, f), JSON.stringify(p, null, 2))
  }
  return dir
}
