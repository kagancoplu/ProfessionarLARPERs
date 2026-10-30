/** A sprite is a list of frames; each frame is rows of palette letters, `.` = transparent. */
export interface SpriteSource {
  name: string
  w: number
  h: number
  frames: string[][]
  /** frames per second when animated */
  fps?: number
  /** anchor in pixels from the top-left (Phaser origin); default bottom-centre */
  anchor?: [number, number]
}

/** Pad (with transparent) or trim rows to exactly `w` columns; keeps hand-drawn matrices honest. */
export const fit = (rows: string[], w: number, h?: number): string[] => {
  const out = rows.map(r => (r.length >= w ? r.slice(0, w) : r.padEnd(w, '.')))
  if (h !== undefined) { while (out.length < h) out.push('.'.repeat(w)); out.length = h }
  return out
}
