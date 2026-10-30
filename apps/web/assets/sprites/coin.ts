import type { SpriteSource } from './types'

/** A spinning sat coin, 8×8, 4 frames. */
export const coin: SpriteSource = {
  name: 'coin',
  w: 8,
  h: 8,
  fps: 8,
  frames: [
    ['..yYYy..', '.yYccYy.', 'yYcYYcYy', 'yYYYYYYy', 'yYYYYYYy', 'yYcYYcYy', '.yYccYy.', '..yyyy..'],
    ['...yY...', '..yYYy..', '.yYccYy.', '.yYYYYy.', '.yYYYYy.', '.yYccYy.', '..yyyy..', '...yy...'],
    ['...yy...', '...yY...', '...yY...', '...yY...', '...yY...', '...yY...', '...yy...', '...yy...'],
    ['...yY...', '..yYYy..', '.yYccYy.', '.yYYYYy.', '.yYYYYy.', '.yYccYy.', '..yyyy..', '...yy...']
  ]
}
