/** The mirror's Sink on Supabase, with the project's secret key (bypasses RLS; lives only in the relay). */
import { createClient } from '@supabase/supabase-js'
import { TABLES, type CoopEnvelope, type Json, type LiveTick } from './contract'
import type { Sink } from './sink'

const check = (what: string, res: { error: { message: string } | null }): void => {
  if (res.error !== null) throw new Error(`supabase ${what}: ${res.error.message}`)
}

export function createSupabaseSink (url: string, secretKey: string): Sink {
  const db = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
  return {
    async upsert (table: string, rows: Json[]) { check(`upsert ${table}`, await db.from(table).upsert(rows)) },
    async deleteListingsExcept (outpoints: string[]) {
      const q = db.from(TABLES.listings).delete()
      check('delete listings', outpoints.length === 0
        ? await q.not('outpoint', 'is', null)
        : await q.not('outpoint', 'in', `(${outpoints.map(o => `"${o}"`).join(',')})`))
    },
    async insertEvents (events: CoopEnvelope[]) {
      const rows = events.map(e => ({
        uid: `${e.src}|${e.id}|${e.ts}`, // the services' counters restart, so the id alone is not unique
        id: e.id, ts: e.ts, src: e.src, type: e.type,
        pool_id: e.poolId ?? null, txid: e.txid ?? null, agent: e.agent ?? null,
        envelope: e
      }))
      check('insert events', await db.from(TABLES.events).upsert(rows, { onConflict: 'uid', ignoreDuplicates: true }))
    },
    async publishTick (tick: LiveTick) { check('insert tick', await db.from(TABLES.ticks).insert({ tick })) },
    async pruneTicks (olderThanMs: number) {
      check('prune ticks', await db.from(TABLES.ticks).delete().lt('ts', new Date(Date.now() - olderThanMs).toISOString()))
    }
  }
}
