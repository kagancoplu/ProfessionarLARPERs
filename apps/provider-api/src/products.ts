/**
 * Products are configuration (MASTER §3.6): one JSON file per product in
 * `products/`. A second provider or product is a second file (plus a runner
 * if it is not a GPU job); no code change in the API.
 *
 * One credit = one unit of the product (gpu-h100: one H100 GPU-hour, so
 * `minutesPerCredit` = 60). Usage is metered by the minute: jobs debit minutes
 * from the prepaid balance, and retail is billed per minute at the per-credit
 * price.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PRODUCTS_DIR = fileURLToPath(new URL('../products/', import.meta.url))

export const minutesPerCredit = (product: Pick<Product, 'minutesPerCredit'>): number => product.minutesPerCredit ?? 1

/** Retail (402) price of a job: per minute at `retailSatsPerCredit` per credit, whole sats rounded up. */
export const retailSatsFor = (product: Pick<Product, 'minutesPerCredit' | 'retailSatsPerCredit'>, minutes: number): number =>
  Math.ceil((minutes * product.retailSatsPerCredit) / minutesPerCredit(product))

export interface Product {
  id: string
  label: string
  unit: string
  /** Retail (402) price of one credit, in satoshis. */
  retailSatsPerCredit: number
  /** GPU minutes one credit buys (gpu-h100: 60). Default 1. */
  minutesPerCredit?: number
  /** Prices are illustrative (FINAL-IDEA §9): shown as "demo pricing" in the catalog and logs. */
  demoPricing?: boolean
  /** BSV-21 credit token id `<txid>_<vout>`; null until `provider-cli mint`. */
  tokenId: string | null
  simulate: {
    /** Simulated minutes of GPU work per real second. */
    minutesPerSecond: number
    /** Jobs that run at once; the rest wait in the queue. Default 8 (one 8×H100 node). */
    gpus?: number
  }
}

const TOKEN_ID_RE = /^[0-9a-f]{64}_\d+$/
const ID_RE = /^[a-z0-9][a-z0-9-]*$/

export function parseProduct (value: unknown, source = 'product'): Product {
  const p = value as Partial<Product>
  const fail = (why: string): never => { throw new Error(`${source}: ${why}`) }
  if (p === null || typeof p !== 'object') fail('not an object')
  if (typeof p.id !== 'string' || !ID_RE.test(p.id)) fail('id must be lowercase letters, digits and dashes')
  if (typeof p.label !== 'string' || p.label === '') fail('label is required')
  if (typeof p.unit !== 'string' || p.unit === '') fail('unit is required')
  if (!Number.isSafeInteger(p.retailSatsPerCredit) || p.retailSatsPerCredit! <= 0) fail('retailSatsPerCredit must be a positive integer')
  if (p.minutesPerCredit !== undefined && (!Number.isSafeInteger(p.minutesPerCredit) || p.minutesPerCredit < 1)) fail('minutesPerCredit must be a positive integer')
  if (p.tokenId !== null && (typeof p.tokenId !== 'string' || !TOKEN_ID_RE.test(p.tokenId))) fail('tokenId must be null or <txid>_<vout>')
  const sim = p.simulate
  if (sim === undefined || !(sim.minutesPerSecond > 0)) fail('simulate.minutesPerSecond must be > 0')
  if (sim!.gpus !== undefined && (!Number.isSafeInteger(sim!.gpus) || sim!.gpus < 1)) fail('simulate.gpus must be a positive integer')
  return p as Product
}

export function loadProducts (dir = PRODUCTS_DIR): Product[] {
  const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort()
  const products = files.map(f => parseProduct(JSON.parse(readFileSync(join(dir, f), 'utf8')), f))
  const ids = new Set<string>()
  for (const p of products) {
    if (ids.has(p.id)) throw new Error(`duplicate product id ${p.id}`)
    ids.add(p.id)
  }
  if (products.length === 0) throw new Error(`no products in ${dir}`)
  return products
}

/** Record the credit token of a product (written by `provider-cli mint`). */
export function setProductTokenId (productId: string, tokenId: string, dir = PRODUCTS_DIR): void {
  const file = join(dir, `${productId}.json`)
  const product = parseProduct(JSON.parse(readFileSync(file, 'utf8')), file)
  product.tokenId = tokenId
  parseProduct(product, file)
  writeFileSync(file, JSON.stringify(product, null, 2) + '\n')
}
