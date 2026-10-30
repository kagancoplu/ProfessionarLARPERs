/** Arcade (guide §20): block height for the festival countdown and day/night; CORS is open. */
import { env } from '../env'
import { getJson, type RequestOptions } from './http'

export function createArcadeApi (base: string) {
  return {
    base,
    height: async (o?: RequestOptions) => (await getJson<{ height: number }>(`${base}/chaintracks/v2/height`, { timeoutMs: 5_000, ...o })).height,
    txUrl: (txid: string) => `${base}/tx/${txid}`
  }
}

export const arcadeApi = createArcadeApi(env.urls.arcade)

/** ~10 minutes per block on BSV; used for "Festival in 3 days" style countdowns. */
export const BLOCK_MINUTES = 10
export function blocksToHuman (blocks: number): string {
  if (blocks <= 0) return 'now'
  const minutes = blocks * BLOCK_MINUTES
  if (minutes < 90) return `${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 36) return `${hours} h`
  return `${Math.round(hours / 24)} days`
}
