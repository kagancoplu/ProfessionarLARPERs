import type { CoopEnvelope, Json, LiveTick } from './contract'

/** Where the mirror writes. The Supabase implementation is supabaseSink.ts; tests use a fake. Every method throws on failure. */
export interface Sink {
  upsert (table: string, rows: Json[]): Promise<void>
  /** delete every listing row whose outpoint is not in `outpoints` */
  deleteListingsExcept (outpoints: string[]): Promise<void>
  /** insert, ignoring events already stored */
  insertEvents (events: CoopEnvelope[]): Promise<void>
  publishTick (tick: LiveTick): Promise<void>
  pruneTicks (olderThanMs: number): Promise<void>
}
