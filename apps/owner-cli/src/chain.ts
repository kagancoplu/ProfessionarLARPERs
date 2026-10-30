/**
 * Chain lookups for the owner's exit path: they need neither the guard nor the
 * overlay, so the owner can withdraw even if both are down or hostile.
 *
 *   beefFromArcade      guide §20.4 (kit), unchanged except for types
 *   wocUnspentByScript  WhatsOnChain GET /v1/bsv/{main|test}/script/{scriptHash}/unspent
 *   findVaultUtxos      chain ∪ the owner's basket ∪ explicit outpoints, each checked against the vault script
 */
import { Hash, MerklePath, Transaction, Utils, type WalletInterface } from '@bsv/sdk'
import type { VaultUtxo } from '../../../packages/core/src/signers/VaultSigner'
import { ownerBasketUtxos, type VaultInfo } from './vault-ops'

export async function beefFromArcade (txid: string, arcadeUrl = 'https://arcade-v2-us-1.bsvblockchain.tech'): Promise<number[]> {
  const seen = new Map<string, Transaction>()
  const load = async (id: string): Promise<Transaction> => {
    if (seen.has(id)) return seen.get(id)!
    const res = await fetch(`${arcadeUrl}/tx/${id}`)
    if (!res.ok) throw new Error(`Arcade /tx/${id} → ${res.status}`)
    const info = await res.json() as { rawTx: string, merklePath?: string }
    const isEF = info.rawTx.slice(8, 20).toLowerCase() === '0000000000ef' // version + EF marker
    const tx = isEF ? Transaction.fromHexEF(info.rawTx) : Transaction.fromHex(info.rawTx)
    seen.set(id, tx)
    if (info.merklePath !== undefined && info.merklePath !== '') tx.merklePath = MerklePath.fromHex(info.merklePath) // mined: proof is enough
    else for (const input of tx.inputs) input.sourceTransaction = await load(input.sourceTXID!) // walk parents
    return tx
  }
  return (await load(txid)).toBEEF()
}

/** WhatsOnChain's script hash: sha256 of the script, byte-reversed. */
export const scriptHash = (lockingScriptHex: string): string =>
  Utils.toHex(Hash.sha256(Utils.toArray(lockingScriptHex, 'hex')).reverse())

export async function wocUnspentByScript (lockingScriptHex: string, network: 'main' | 'test'): Promise<Array<{ outpoint: string, satoshis: number, height: number }>> {
  const res = await fetch(`https://api.whatsonchain.com/v1/bsv/${network}/script/${scriptHash(lockingScriptHex)}/unspent`)
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`WhatsOnChain → ${res.status}`)
  const rows = await res.json() as Array<{ tx_hash: string, tx_pos: number, value: number, height: number }>
  return rows.map(r => ({ outpoint: `${r.tx_hash}.${r.tx_pos}`, satoshis: r.value, height: r.height }))
}

export async function findVaultUtxos (owner: WalletInterface, vault: VaultInfo, opts: {
  network: 'main' | 'test'
  arcadeUrl: string
  outpoints?: string[]
  originator?: string
}): Promise<{ utxos: VaultUtxo[], notes: string[] }> {
  const notes: string[] = []
  let onChain: Set<string> | undefined
  const wanted = new Map<string, number | undefined>()
  try {
    const rows = await wocUnspentByScript(vault.lockingScriptHex, opts.network)
    onChain = new Set(rows.map(r => r.outpoint))
    for (const r of rows) wanted.set(r.outpoint, r.satoshis)
  } catch (e) {
    notes.push(`WhatsOnChain unavailable (${(e as Error).message}): using the Desktop basket and --outpoint only`)
  }

  const found = new Map<string, VaultUtxo>()
  for (const u of await ownerBasketUtxos(owner, vault, opts.originator)) {
    if (onChain !== undefined && !onChain.has(u.outpoint)) {
      notes.push(`${u.outpoint}: in the Desktop basket but not unspent on chain (spent by agent + guard, or not indexed yet); skipped`)
      continue
    }
    found.set(u.outpoint, u)
  }
  for (const op of opts.outpoints ?? []) if (!wanted.has(op)) wanted.set(op, undefined)

  for (const outpoint of wanted.keys()) {
    if (found.has(outpoint)) continue
    const [txid, vout] = outpoint.split('.')
    const beef = await beefFromArcade(txid, opts.arcadeUrl)
    const out = Transaction.fromBEEF(beef, txid).outputs[Number(vout)]
    if (out?.lockingScript.toHex() !== vault.lockingScriptHex) { notes.push(`${outpoint}: not an output of this vault; skipped`); continue }
    found.set(outpoint, { outpoint, satoshis: out.satoshis ?? 0, lockingScriptHex: vault.lockingScriptHex, beef })
  }
  return { utxos: [...found.values()], notes }
}
