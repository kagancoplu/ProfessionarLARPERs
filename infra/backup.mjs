#!/usr/bin/env node
/**
 * Online backup of the overlay and coordinator state (B-P5a §5).
 *
 *   node infra/backup.mjs                 → $BACKUP_DIR/<UTC stamp>/{overlay.db, coordinator.db, overlay.key}
 *   node infra/backup.mjs restore <dir>   → copies a backup back into $DATA_DIR (stop the service first)
 *
 * SQLite files are copied with better-sqlite3's backup API, which is consistent
 * while the services keep writing. Backups older than BACKUP_KEEP_DAYS (7) are
 * deleted. Env: DATA_DIR (./data), BACKUP_DIR (./backups), BACKUP_KEEP_DAYS.
 * Cron (daily 03:17): 17 3 * * * cd /opt/agentcoop && DATA_DIR=/var/lib/agentcoop BACKUP_DIR=/var/backups/agentcoop node infra/backup.mjs
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const Database = createRequire(join(root, 'package.json'))('better-sqlite3')
const dataDir = resolve(root, process.env.DATA_DIR?.trim() || 'data') // empty DATA_DIR= = default
const backupDir = resolve(root, process.env.BACKUP_DIR ?? 'backups')
const keepDays = Number(process.env.BACKUP_KEEP_DAYS ?? 7)

const FILES = [
  { rel: 'overlay/overlay.db', sqlite: true },
  { rel: 'coordinator/coordinator.db', sqlite: true },
  { rel: 'coordinator2/coordinator.db', sqlite: true, as: 'coordinator2.db' },
  { rel: 'overlay/overlay.key', sqlite: false, mode: 0o600 }
]

async function backup () {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const out = join(backupDir, stamp)
  mkdirSync(out, { recursive: true, mode: 0o700 })
  for (const f of FILES) {
    const src = join(dataDir, f.rel)
    if (!existsSync(src)) { console.log(`[backup] skip ${f.rel} (missing)`); continue }
    const dst = join(out, f.as ?? f.rel.split('/').pop())
    if (f.sqlite) {
      const db = new Database(src, { readonly: true, fileMustExist: true })
      try { await db.backup(dst) } finally { db.close() }
    } else {
      copyFileSync(src, dst)
    }
    chmodSync(dst, 0o600)
    console.log(`[backup] ${f.rel} → ${dst}`)
  }
  const cutoff = Date.now() - keepDays * 86_400_000
  for (const name of readdirSync(backupDir)) {
    const p = join(backupDir, name)
    if (p !== out && statSync(p).isDirectory() && statSync(p).mtimeMs < cutoff) {
      rmSync(p, { recursive: true, force: true })
      console.log(`[backup] pruned ${name}`)
    }
  }
}

function restore (from) {
  if (from === undefined || !existsSync(from)) { console.error('usage: node infra/backup.mjs restore <backup dir>'); process.exit(1) }
  for (const f of FILES) {
    const src = join(from, f.as ?? f.rel.split('/').pop())
    if (!existsSync(src)) { console.log(`[restore] skip ${f.rel} (not in backup)`); continue }
    const dst = join(dataDir, f.rel)
    mkdirSync(dirname(dst), { recursive: true })
    for (const suffix of ['-wal', '-shm']) rmSync(dst + suffix, { force: true }) // stale journal of the replaced db
    copyFileSync(src, dst)
    if (f.mode !== undefined) chmodSync(dst, f.mode)
    console.log(`[restore] ${src} → ${dst}`)
  }
}

if (process.argv[2] === 'restore') restore(process.argv[3] && resolve(process.argv[3]))
else await backup()
