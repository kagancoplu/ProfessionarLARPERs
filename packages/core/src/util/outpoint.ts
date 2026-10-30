/**
 * Outpoints: AgentCoop data (terms, plans, OP_RETURNs, APIs) always uses
 * `txid_vout` (like BSV-21 ids); BRC-100 wallet calls use `txid.vout`.
 */
export interface Outpoint { txid: string, vout: number }

export function parseOutpoint (s: string): Outpoint {
  const m = /^([0-9a-f]{64})[._](\d+)$/.exec(s)
  if (m === null) throw new Error(`bad outpoint ${s}`)
  return { txid: m[1], vout: Number(m[2]) }
}

export const coopOutpoint = (txid: string, vout: number): string => `${txid}_${vout}`
export const toWalletOutpoint = (s: string): string => { const o = parseOutpoint(s); return `${o.txid}.${o.vout}` }
export const fromWalletOutpoint = (s: string): string => { const o = parseOutpoint(s); return coopOutpoint(o.txid, o.vout) }
