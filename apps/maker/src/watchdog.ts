/**
 * The maker's watchdog over its swaps (F-4, docs/AUDIT-READINESS.md §6). Every swap record that
 * `swap-demo.ts` writes to data/rail/<swapId>.json holds the pre-signed refund. Once the funding is out:
 *
 *   - the agent claimed the HTLC (its spender is not the refund): read the secret from that claim and
 *     claim the USDC on Base, even if the process that ran the swap stopped before step 6;
 *   - nobody claimed and the tip is past the refund's nLockTime: broadcast the refund. The agent's claim
 *     branch never expires, so every block the refund waits is a block in which the agent could still
 *     claim after the Base timeout.
 *
 *   npm run watchdog -w @agentcoop/maker            # every 60 s, until stopped
 *   npm run watchdog -w @agentcoop/maker -- --once  # one pass
 *
 * `npm run maker` runs the same loop next to the HTTP face.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Transaction } from '@agentcoop/core/sdk'
import { broadcastEF } from '@agentcoop/core'
import type { Address, Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { claimUsdc } from './base'
import { ViemEvm } from './evm'
import { extractSecret, REFUND_FINAL_MARGIN_BLOCKS, type Funding } from './rail'

/** The fields of a swap record the watchdog reads and writes (the file has more). */
export interface RailRecord {
  swapId?: string
  hash?: string
  baseLock?: { id: Hex, tx?: string, timeout?: string }
  fundingTxid?: string
  fundingVout?: number
  fundingSent?: boolean
  refundTxid?: string
  refundEF?: string
  refundLockTime?: number
  claimTxid?: string
  /** the maker's USDC claim on Base, with the secret read from `claimTxid` */
  baseClaimTx?: string
  refunded?: { txid: string, at: string, tip: number }
  refundError?: { message: string, at: string, tip: number }
  usdcError?: { message: string, at: string }
}

/** Broadcast now: the funding is out, nobody claimed, the refund is final and not sent yet. */
export function refundDue (r: RailRecord, tip: number): boolean {
  return r.fundingSent === true && r.claimTxid === undefined && r.refunded === undefined &&
    r.refundEF !== undefined && r.refundLockTime !== undefined &&
    tip >= r.refundLockTime + REFUND_FINAL_MARGIN_BLOCKS
}

export interface WatchdogDeps {
  /** Swap records with a way to write each one back. */
  records: () => Array<{ record: RailRecord, save: (r: RailRecord) => void }>
  tip: () => Promise<number>
  /** Sends Extended Format hex; returns the txid or throws. */
  broadcast: (efHex: string) => Promise<string>
  /** USDC side, all three or none: the tx spending an output (or undefined), a tx by id, the maker's Base claim. */
  spentBy?: (txid: string, vout: number) => Promise<string | undefined>
  fetchTx?: (txid: string) => Promise<Transaction>
  claimUsdc?: (lockId: Hex, secret: Hex) => Promise<string>
  log?: (line: string) => void
}

/** One pass over the records. A failed broadcast or claim is recorded and tried again on the next pass. */
export async function watchOnce (d: WatchdogDeps): Promise<{ sent: string[], failed: string[], claimed: string[] }> {
  const log = d.log ?? (() => {})
  const open = d.records().filter(x => x.record.fundingSent === true && x.record.refunded === undefined && x.record.baseClaimTx === undefined)
  const sent: string[] = []
  const failed: string[] = []
  const claimed: string[] = []
  if (open.length === 0) return { sent, failed, claimed }
  const usdc = d.spentBy !== undefined && d.fetchTx !== undefined && d.claimUsdc !== undefined
  let tip: number | undefined
  for (const { record, save } of open) {
    const at = new Date().toISOString()
    const name = record.swapId ?? '?'
    // the agent claimed: the secret is public now, so take the USDC before the Base timeout
    if (usdc && record.fundingTxid !== undefined && record.fundingVout !== undefined && record.hash !== undefined && record.baseLock?.id !== undefined) {
      let spender: string | undefined
      try { spender = await d.spentBy!(record.fundingTxid, record.fundingVout) } catch { spender = undefined } // unknown: look again next pass
      if (spender !== undefined && spender !== record.refundTxid) {
        try {
          const claim = await d.fetchTx!(spender)
          const funding = { txid: record.fundingTxid, vout: record.fundingVout } as unknown as Funding
          const txHash = await d.claimUsdc!(record.baseLock.id, extractSecret(claim, funding, record.hash))
          save({ ...record, claimTxid: spender, baseClaimTx: txHash, usdcError: undefined })
          claimed.push(txHash)
          log(`✓ USDC claimed ${txHash} for swap ${name} (secret from ${spender})`)
        } catch (e) {
          save({ ...record, claimTxid: spender, usdcError: { message: (e as Error).message, at } })
          failed.push(name)
          log(`✗ USDC claim for swap ${name} failed: ${(e as Error).message}`)
        }
        continue
      }
    }
    if (record.claimTxid !== undefined || record.refundEF === undefined || record.refundLockTime === undefined) continue
    tip ??= await d.tip()
    if (!refundDue(record, tip)) continue
    try {
      const txid = await d.broadcast(record.refundEF)
      save({ ...record, refunded: { txid, at, tip }, refundError: undefined })
      sent.push(txid)
      log(`✓ refund ${txid} for swap ${name} (nLockTime ${record.refundLockTime}, tip ${tip})`)
    } catch (e) {
      // A spent HTLC means the agent claimed after all: the USDC branch above takes it on the next pass.
      save({ ...record, refundError: { message: (e as Error).message, at, tip } })
      failed.push(name)
      log(`✗ refund for swap ${name} refused: ${(e as Error).message}`)
    }
  }
  return { sent, failed, claimed }
}

/** WhatsOnChain's bulk spent lookup: the txid that spent `txid:vout`, or undefined (unspent or not indexed yet). */
export const wocSpentBy = (network: 'main' | 'test' = 'main') => async (txid: string, vout: number): Promise<string | undefined> => {
  const res = await fetch(`https://api.whatsonchain.com/v1/bsv/${network}/utxos/spent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ utxos: [{ txid, vout }] })
  })
  if (!res.ok) throw new Error(`WhatsOnChain spent lookup: HTTP ${res.status}`)
  const [item] = await res.json() as Array<{ spentIn?: { txid?: string } | null, error?: string }>
  const by = item?.spentIn?.txid
  return typeof by === 'string' && /^[0-9a-f]{64}$/i.test(by) ? by.toLowerCase() : undefined
}

/** The records in `dir` (data/rail), each saved back in place (mode 0600, like swap-demo). */
export function fileRecords (dir: string): () => Array<{ record: RailRecord, save: (r: RailRecord) => void }> {
  return () => {
    let names: string[]
    try { names = readdirSync(dir).filter(n => n.endsWith('.json')) } catch { return [] }
    return names.flatMap(n => {
      const file = join(dir, n)
      try {
        const record = JSON.parse(readFileSync(file, 'utf8')) as RailRecord
        return [{ record, save: (r: RailRecord) => { writeFileSync(file, JSON.stringify(r, null, 2) + '\n', { mode: 0o600 }) } }]
      } catch { return [] }
    })
  }
}

/**
 * The USDC side of the watchdog from .env: BASE_PRIVATE_KEY (maker) and BASE_HTLC_ADDRESS, or nothing (refunds only).
 * Never logs the key.
 */
export function usdcClaimFromEnv (env: NodeJS.ProcessEnv, network: 'main' | 'test', fetchTx: (txid: string) => Promise<Transaction>): Pick<WatchdogDeps, 'spentBy' | 'fetchTx' | 'claimUsdc'> {
  const key = env.BASE_PRIVATE_KEY
  const htlc = env.BASE_HTLC_ADDRESS
  if (key === undefined || !/^0x[0-9a-fA-F]{64}$/.test(key) || htlc === undefined || !/^0x[0-9a-fA-F]{40}$/.test(htlc)) return {}
  const evm = new ViemEvm(env.BASE_RPC_URL || 'https://sepolia.base.org', [key as Hex])
  const from = privateKeyToAccount(key as Hex).address
  return {
    spentBy: wocSpentBy(network),
    fetchTx,
    claimUsdc: async (id, secret) => (await claimUsdc(evm, { htlc: htlc as Address, from, id, secret })).txHash
  }
}

/** Arcade broadcast of an Extended Format hex. */
export const arcadeBroadcast = (arcadeUrl: string) => async (efHex: string): Promise<string> =>
  await broadcastEF(Transaction.fromHexEF(efHex), arcadeUrl)

/** Run `watchOnce` every `intervalMs` until the returned stop() is called. */
export function startWatchdog (d: WatchdogDeps, intervalMs = 60_000): () => void {
  let running = false
  const tick = async (): Promise<void> => {
    if (running) return
    running = true
    try { await watchOnce(d) } catch (e) { d.log?.(`watchdog pass failed: ${(e as Error).message}`) } finally { running = false }
  }
  void tick()
  const t = setInterval(() => { void tick() }, intervalMs)
  return () => { clearInterval(t) }
}
