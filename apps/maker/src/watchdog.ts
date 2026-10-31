/**
 * The maker's refund watchdog (F-4, docs/AUDIT-READINESS.md §6). Every swap record that
 * `swap-demo.ts` writes to data/rail/<swapId>.json holds the pre-signed refund. Once the
 * funding is out, the swap is not claimed and the tip is past the refund's nLockTime, the
 * watchdog broadcasts the refund: the agent's claim branch never expires, so every block the
 * refund waits is a block in which the agent could still claim after the Base timeout.
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
import { REFUND_FINAL_MARGIN_BLOCKS } from './rail'

/** The fields of a swap record the watchdog reads and writes (the file has more). */
export interface RailRecord {
  swapId?: string
  fundingTxid?: string
  fundingSent?: boolean
  refundTxid?: string
  refundEF?: string
  refundLockTime?: number
  claimTxid?: string
  refunded?: { txid: string, at: string, tip: number }
  refundError?: { message: string, at: string, tip: number }
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
  log?: (line: string) => void
}

/** One pass over the records. A failed broadcast is recorded and tried again on the next pass. */
export async function watchOnce (d: WatchdogDeps): Promise<{ sent: string[], failed: string[] }> {
  const log = d.log ?? (() => {})
  const due = d.records().filter(x => x.record.fundingSent === true && x.record.claimTxid === undefined && x.record.refunded === undefined)
  if (due.length === 0) return { sent: [], failed: [] }
  const tip = await d.tip()
  const sent: string[] = []
  const failed: string[] = []
  for (const { record, save } of due) {
    if (!refundDue(record, tip)) continue
    const at = new Date().toISOString()
    try {
      const txid = await d.broadcast(record.refundEF!)
      save({ ...record, refunded: { txid, at, tip }, refundError: undefined })
      sent.push(txid)
      log(`✓ refund ${txid} for swap ${record.swapId ?? '?'} (nLockTime ${record.refundLockTime}, tip ${tip})`)
    } catch (e) {
      // A spent HTLC means the agent claimed after all: read the secret from that claim and claim the USDC.
      save({ ...record, refundError: { message: (e as Error).message, at, tip } })
      failed.push(record.swapId ?? '?')
      log(`✗ refund for swap ${record.swapId ?? '?'} refused: ${(e as Error).message}`)
    }
  }
  return { sent, failed }
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
