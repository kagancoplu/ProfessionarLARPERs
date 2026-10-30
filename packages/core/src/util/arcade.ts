/**
 * Chain facts for planSettlement from Arcade (guide §20.1):
 *   GET /health → { blockHeight, datahub_urls: [{ healthy, policy: { miningFee: { satoshis, bytes } } }] }
 * The fee rate is the highest miningFee among healthy datahubs (sats per 1000 bytes).
 */
import { ARCADE_URL } from '../types'

export interface ChainPolicy { height: number, satsPerKb: number, maxTxSize?: number }

interface Health {
  blockHeight?: number
  datahub_urls?: Array<{ healthy?: boolean, policy?: { miningFee?: { satoshis: number, bytes: number }, maxtxsizepolicy?: number } }>
}

export async function fetchChainPolicy (arcadeUrl = ARCADE_URL, fallbackSatsPerKb = 100): Promise<ChainPolicy> {
  const res = await fetch(`${arcadeUrl}/health`)
  if (!res.ok) throw new Error(`Arcade /health failed (${res.status})`)
  const h = await res.json() as Health
  const hubs = (h.datahub_urls ?? []).filter(d => d.healthy !== false && d.policy?.miningFee !== undefined)
  const rates = hubs.map(d => Math.ceil(d.policy!.miningFee!.satoshis * 1000 / d.policy!.miningFee!.bytes))
  const sizes = hubs.map(d => d.policy!.maxtxsizepolicy).filter((x): x is number => typeof x === 'number')
  let height = h.blockHeight
  if (height === undefined) height = (await (await fetch(`${arcadeUrl}/chaintracks/v2/height`)).json() as { height: number }).height
  return { height, satsPerKb: rates.length > 0 ? Math.max(...rates) : fallbackSatsPerKb, maxTxSize: sizes.length > 0 ? Math.min(...sizes) : undefined }
}
