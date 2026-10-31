/**
 * Durable, shared 402 replay store (T-17). The payment middleware's default store lives in one
 * process's memory: a second provider process, or the same one after a restart, would accept
 * the same payment again. Here a claim creates `<dir>/<txid>` with O_CREAT|O_EXCL, which the
 * filesystem makes atomic across every process on the host that shares `dir`.
 *
 * For providers on several hosts, use a store with the same atomic claim on a shared database
 * (for example `INSERT … ON CONFLICT DO NOTHING` on a primary key).
 */
import { mkdirSync, openSync, closeSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import type { PaymentReplayStore } from '@bsv/payment-express-middleware'

const TXID = /^[0-9a-f]{64}$/

export class FileReplayStore implements PaymentReplayStore {
  constructor (private readonly dir: string) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }

  /** true the first time a txid is claimed, by any process sharing `dir`; false ever after. */
  claim (transactionId: string): boolean {
    const txid = transactionId.toLowerCase()
    if (!TXID.test(txid)) return false // never a path: only a txid names a file
    let fd: number
    try {
      fd = openSync(join(this.dir, txid), 'wx', 0o600)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false
      throw e
    }
    try { writeSync(fd, new Date().toISOString()) } finally { closeSync(fd) }
    return true
  }
}
