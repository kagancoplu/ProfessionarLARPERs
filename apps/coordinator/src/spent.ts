/**
 * Is a pledge coin already spent on chain? The overlay only knows spends that
 * were submitted to it; a participant may spend its coin elsewhere. Checked
 * before each round (and after a failed broadcast) so such coins are
 * blacklisted instead of failing the settlement.
 */
export interface SpentChecker {
  /** outpoint ("txid_vout") → spent? Missing = unknown (treated as unspent). */
  spent: (outpoints: string[]) => Promise<Map<string, boolean>>
}

export const noSpentChecker: SpentChecker = { spent: async () => new Map() }

/** WhatsOnChain bulk spent check: POST /v1/bsv/{net}/utxos/spent, at most 20 per request. */
export class WocSpentChecker implements SpentChecker {
  constructor (private readonly network: 'main' | 'test' = 'main', private readonly apiKey?: string) {}

  async spent (outpoints: string[]): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>()
    for (let i = 0; i < outpoints.length; i += 20) {
      const batch = outpoints.slice(i, i + 20)
      try {
        const res = await fetch(`https://api.whatsonchain.com/v1/bsv/${this.network}/utxos/spent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(this.apiKey !== undefined ? { Authorization: this.apiKey } : {}) },
          body: JSON.stringify({ utxos: batch.map(o => { const [txid, vout] = o.split('_'); return { txid, vout: Number(vout) } }) })
        })
        if (!res.ok) continue
        for (const item of await res.json() as Array<{ utxo?: { txid: string, vout: number }, spentIn?: { txid?: string } | null }>) {
          if (item.utxo === undefined) continue
          result.set(`${item.utxo.txid}_${item.utxo.vout}`, item.spentIn?.txid !== undefined)
        }
      } catch {
        // unknown: the broadcast is the final check
      }
    }
    return result
  }
}
