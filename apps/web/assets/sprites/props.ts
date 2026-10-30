import { fit, type SpriteSource } from './types'

/** Credit chest, 16×16: closed, open (gold inside). */
export const chest: SpriteSource = {
  name: 'chest', w: 16, h: 16,
  frames: [
    ['................', '................', '....KKKKKKKK....', '...KwWWWWWWwK...', '...KWWWWWWWWK...', '...KKKKKKKKKK...', '...KDDDDDDDDK...', '...KDDDKKDDDK...', '...KDDDKYKDDK...', '...KDDDKKDDDK...', '...KDDDDDDDDK...', '...KDDDDDDDDK...', '...KKKKKKKKKK...', '................', '................', '................'],
    ['................', '...KKKKKKKKKK...', '...KwWWWWWWwK...', '...KWWWWWWWWK...', '...KKKKKKKKKK...', '...KYyYyYyYyK...', '...KyYyYyYyYK...', '...KDDDDDDDDK...', '...KDDDDDDDDK...', '...KDDDDDDDDK...', '...KDDDDDDDDK...', '...KDDDDDDDDK...', '...KKKKKKKKKK...', '................', '................', '................']
  ]
}

/** The settlement bell, 16×16, 2 frames (rest, swung). */
export const bell: SpriteSource = {
  name: 'bell', w: 16, h: 16, fps: 4,
  frames: [
    ['.......KK.......', '......KDDK......', '......KYYK......', '.....KYYYYK.....', '.....KYYYYK.....', '....KYyYYyYK....', '....KYYYYYYK....', '....KYYYYYYK....', '...KYyYYYYyYK...', '...KYYYYYYYYK...', '..KyyyyyyyyyyK..', '..KKKKKKKKKKKK..', '......KDDK......', '......KKKK......', '................', '................'],
    ['........KK......', '.......KDDK.....', '.......KYYK.....', '......KYYYYK....', '.....KYYYYYK....', '....KYyYYYyYK...', '....KYYYYYYYK...', '...KYYYYYYYK....', '...KYyYYYyYK....', '..KYYYYYYYYK....', '..KyyyyyyyyyK...', '..KKKKKKKKKKK...', '.....KDDK.......', '.....KKKK.......', '................', '................']
  ]
}

/** The settlement cart with its horse, 40×24, 2 frames (wheel/leg phase). */
const cartRow = (phase: number): string[] => [
  '........................................',
  '............................KKKK........',
  '...........................KTTTTK.......',
  '..........................KTTTTTTK......',
  '..KKKKKKKKKKKKKKKKKKKK....KTTKTTTTK.....',
  '.KwWWWWWWWWWWWWWWWWWWwK...KTTTTTTTK.....',
  '.KWYyYyYyYyYyYyYyYyYyWK..KTTTTTTTTTK....',
  '.KWyYyYyYyYyYyYyYyYyYWK.KKTTTTTTTTTTK...',
  '.KWYyYyYyYyYyYyYyYyYyWKKTTTTTTTTTTTTK...',
  '.KWWWWWWWWWWWWWWWWWWWWKTTTTTTTTTTTTTTK..',
  '.KDDDDDDDDDDDDDDDDDDDDKKTTTTTTTTTTTTTK..',
  '.KDDDDDDDDDDDDDDDDDDDDK.KTTTTTTTTTTTTK..',
  '.KKKKKKKKKKKKKKKKKKKKKK.KTTTTTTTTTTTTK..',
  '...KKKK..........KKKK...KTTTKKKKKKTTTK..',
  '..KDKKDK........KDKKDK..KTTK....KTTK....',
  '..KKDDKK........KKDDKK..KTTK....KTTK....',
  '..KDKKDK........KDKKDK..KTTK....KTTK....',
  '...KKKK..........KKKK...KKKK....KKKK....',
  '........................................',
  '........................................',
  '........................................',
  '........................................',
  '........................................',
  '........................................'
].map((row, y) => (phase === 1 && (y === 14 || y === 16) ? row.replace('KDKKDK', 'KKDDKK').replace('KDKKDK', 'KKDDKK') : phase === 1 && y === 15 ? row.replace(/KKDDKK/g, 'KDKKDK') : row))
  .map((row, y) => (phase === 1 && y >= 14 && y <= 16 ? row.replace('KTTK....KTTK', '.KTTK..KTTK.') : row))

export const cart: SpriteSource = { name: 'cart', w: 40, h: 24, fps: 6, frames: [fit(cartRow(0), 40, 24), fit(cartRow(1), 40, 24)] }

/** A tree, 16×24. */
export const tree: SpriteSource = {
  name: 'tree', w: 16, h: 24,
  frames: [fit([
    '......KKKK......', '....KKgggGKK....', '...KgggGGGGgK...', '..KggGGGGGGGgK..', '..KgGGGGGGGGgK..', '.KggGGGGGGGGGgK.', '.KgGGGGgGGGGGgK.', '.KgGGGGGGGGGGgK.', '.KggGGGGGGGGggK.',
    '..KgGGGGGGGGgK..', '..KggGGGgGGggK..', '...KgggGGgggK...', '....KKggggKK....', '......KKKK......', '......KDDK......', '......KDDK......', '......KDDK......', '......KDDK......', '.....KDDDDK.....',
    '....gKKKKKKg....', '................', '................', '................', '................'
  ], 16, 24)]
}

/** Hourglass over the board during lock-in reuses `hourglass`; the "✓" over a villager is DOM. */
