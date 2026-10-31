/** The film scripts `/film?film=<name>` can play (VIDEO.md). */
import type { Director } from './director'
import { NARRATION as POOL_NARRATION, POOL_DURATION, pool } from './pool'

export interface Film {
  title: string
  duration: number
  narration: ReadonlyArray<{ at: number, text: string, sec: number }>
  run: (d: Director, roll: Promise<void>) => Promise<void>
}

export const FILMS: Record<string, Film> = {
  pool: { title: 'The Pool', duration: POOL_DURATION, narration: POOL_NARRATION, run: pool }
}
