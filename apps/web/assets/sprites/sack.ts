import type { SpriteSource } from './types'

/** The pool's sack under the board, 16×16, 5 fill levels (0 %, 25 %, 50 %, 75 %, 100 %). */
const empty = [
  '................',
  '......tKKt......',
  '.....tKttKt.....',
  '.....KTTTTK.....',
  '....KTttttTK....',
  '...KTttttttTK...',
  '...KTttttttTK...',
  '..KTttttttttTK..',
  '..KTttttttttTK..',
  '..KTttttttttTK..',
  '..KTttttttttTK..',
  '..KTttttttttTK..',
  '..KTTttttttTTK..',
  '...KTTTTTTTTK...',
  '....KKKKKKKK....',
  '................'
]
const fill = (level: number): string[] => empty.map((row, y) => {
  // coins fill from the bottom (row 12) upwards
  const fillRows = [12, 11, 10, 9, 8, 7, 6, 5]
  const n = Math.round((fillRows.length * level) / 4)
  if (!fillRows.slice(0, n).includes(y)) return row
  return row.replace(/t/g, (_m, i: number) => ((i + y) % 2 === 0 ? 'Y' : 'y'))
})

export const sack: SpriteSource = { name: 'sack', w: 16, h: 16, frames: [0, 1, 2, 3, 4].map(fill) }
