/** Coop Rail maker (Track D.P3, MASTER §3.10): quotes and an event stream; the swap itself has no HTTP API yet. */
import { env } from '../env'
import { getJson, type RequestOptions } from './http'

export interface RailQuote {
  dir: 'usdc-bsv'
  /** USDC base units (6 decimals) */
  usdc: string
  sats: number
  satsPerUsdc: number
  spreadBps: number
  expiresAt: string
  maker: { evm: string, bsv: string }
  htlc: string
  token: string
  terms: { hash: string, minBaseTimeoutLeftS: number, bsvRefundBlocks: number, landsIn: string }
}

export function createMakerApi (base: string) {
  return {
    base,
    healthz: (o?: RequestOptions) => getJson<{ ok: boolean, maker: { evm: string, bsv: string }, network: unknown }>(`${base}/healthz`, { timeoutMs: 4_000, ...o }),
    quote: (usdcBaseUnits: string, o?: RequestOptions) => getJson<RailQuote>(`${base}/quote?dir=usdc-bsv&amount=${encodeURIComponent(usdcBaseUnits)}`, o),
    eventsUrl: `${base}/events`
  }
}

export type MakerApi = ReturnType<typeof createMakerApi>
export const makerApi: MakerApi = createMakerApi(env.urls.maker)
