/**
 * Products are configuration (MASTER §3.6): one JSON file per product in
 * `products/`, each naming the runner that serves its jobs (runners.ts). A
 * second product is a second file; a new kind of work is a new runner.
 *
 * One credit = one unit of the product, metered in the runner's smaller unit:
 *   gpu-h100    1 credit = 1 H100 GPU-hour = 60 GPU-minutes (`minutesPerCredit`)
 *   data-proxy  1 credit = 1 GB of proxy bandwidth = 1024 MB (`unitsPerCredit`)
 * Jobs debit those units from the prepaid balance; retail is billed per unit
 * at the per-credit price.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PRODUCTS_DIR = fileURLToPath(new URL('../products/', import.meta.url))

export type RunnerId = 'gpu' | 'proxy'
export const RUNNER_IDS: readonly RunnerId[] = ['gpu', 'proxy']

/** Metered units one credit buys (GPU-minutes for gpu, MB for proxy). Default 1. */
export const unitsPerCredit = (product: Pick<Product, 'unitsPerCredit' | 'minutesPerCredit'>): number => product.unitsPerCredit ?? product.minutesPerCredit ?? 1
/** GPU products: same as unitsPerCredit (kept for the GPU code paths and the catalog field). */
export const minutesPerCredit = unitsPerCredit
export const runnerIdOf = (product: Pick<Product, 'runner'>): RunnerId => product.runner ?? 'gpu'
export const unitsPerSecond = (product: Pick<Product, 'simulate'>): number => product.simulate.unitsPerSecond ?? product.simulate.minutesPerSecond ?? 1
export const slotsOf = (product: Pick<Product, 'simulate'>): number => product.simulate.slots ?? product.simulate.gpus ?? 8
/** The product a request without `product` means: the first GPU product (MASTER §3.6 compatibility), else the first. */
export const defaultProduct = <P extends Pick<Product, 'runner'>>(products: P[]): P | undefined => products.find(p => runnerIdOf(p) === 'gpu') ?? products[0]

/** Retail (402) price of a job: per metered unit at `retailSatsPerCredit` per credit, whole sats rounded up. */
export const retailSatsFor = (product: Pick<Product, 'unitsPerCredit' | 'minutesPerCredit' | 'retailSatsPerCredit'>, units: number): number =>
  Math.ceil((units * product.retailSatsPerCredit) / unitsPerCredit(product))

export interface Product {
  id: string
  label: string
  unit: string
  /** Retail (402) price of one credit, in satoshis. */
  retailSatsPerCredit: number
  /** Which runner serves the jobs (runners.ts). Default 'gpu'. */
  runner?: RunnerId
  /** GPU products: GPU minutes one credit buys (gpu-h100: 60). Default 1. */
  minutesPerCredit?: number
  /** Any product: metered units one credit buys (data-proxy: 1024 MB). Overrides minutesPerCredit. */
  unitsPerCredit?: number
  /** Prices are illustrative (FINAL-IDEA §9): shown as "demo pricing" in the catalog and logs. */
  demoPricing?: boolean
  /** BSV-21 credit token id `<txid>_<vout>`; null until `provider-cli mint`. */
  tokenId: string | null
  simulate: {
    /** GPU: simulated minutes of work per real second. */
    minutesPerSecond?: number
    /** Any runner: simulated units (minutes, MB…) per real second. Overrides minutesPerSecond. */
    unitsPerSecond?: number
    /** GPU: jobs that run at once (one 8×H100 node = 8). */
    gpus?: number
    /** Any runner: jobs that run at once; the rest queue. Overrides gpus. Default 8. */
    slots?: number
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
  if (p.runner !== undefined && !RUNNER_IDS.includes(p.runner)) fail(`runner must be one of ${RUNNER_IDS.join(', ')}`)
  for (const k of ['minutesPerCredit', 'unitsPerCredit'] as const) {
    if (p[k] !== undefined && (!Number.isSafeInteger(p[k]) || p[k]! < 1)) fail(`${k} must be a positive integer`)
  }
  if (p.tokenId !== null && (typeof p.tokenId !== 'string' || !TOKEN_ID_RE.test(p.tokenId))) fail('tokenId must be null or <txid>_<vout>')
  const sim = p.simulate
  if (sim === undefined || !((sim.unitsPerSecond ?? sim.minutesPerSecond ?? 0) > 0)) fail('simulate.unitsPerSecond (or minutesPerSecond) must be > 0')
  for (const k of ['gpus', 'slots'] as const) {
    if (sim![k] !== undefined && (!Number.isSafeInteger(sim![k]) || sim![k]! < 1)) fail(`simulate.${k} must be a positive integer`)
  }
  return p as Product
}

export function loadProducts (dir = PRODUCTS_DIR): Product[] {
  const files = readdirSync(dir).filter(f => f.endsWith('.json') && !f.endsWith('.schema.json')).sort()
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
