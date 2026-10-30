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
