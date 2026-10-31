/** The film segments `/film?film=<name>` can play (VIDEO.md); the app tour is `/?tour=main` (tourMain.ts). */
import type { JSX } from 'react'
import type { Director } from './director'
import { manifesto, MANIFESTO_DURATION } from './manifesto'
import { lines, type Line } from './narration'
import { pool, POOL_DURATION } from './pool'
import { WHY_CUES, WHY_DURATION, WhyBsv } from './WhyBsv'

export interface Film {
  title: string
  duration: number
  narration: Line[]
  /** a scene in the Town, driven by a director */
  run?: (d: Director, roll: Promise<void>) => Promise<void>
  /** or a motion graphic drawn from the film time alone */
  Scene?: (props: { t: number }) => JSX.Element
  /** a motion graphic's sound effects (a Town scene logs its own) */
  cues?: Array<{ t: number, name: string }>
}

export const FILMS: Record<string, Film> = {
  pool: { title: 'The Pool', duration: POOL_DURATION, narration: lines('pool'), run: pool },
  why: { title: 'Why BSV', duration: WHY_DURATION, narration: lines('why'), Scene: WhyBsv, cues: WHY_CUES },
  manifesto: { title: 'Manifesto', duration: MANIFESTO_DURATION, narration: lines('manifesto'), run: manifesto }
}
