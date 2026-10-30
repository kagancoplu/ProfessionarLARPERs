/** Numeric colours for Phaser tints and shapes, derived from assets/palette.ts (no stray hexes in the Town). */
import { PALETTE } from '../../assets/palette'

export const hexToNumber = (hex: string): number => parseInt(hex.replace('#', ''), 16)
export const COLORS = {
  grass: hexToNumber(PALETTE.G!.day),
  nightSky: hexToNumber(PALETTE.S!.night),
  stone: hexToNumber(PALETTE.s!.day),
  lantern: hexToNumber(PALETTE.Y!.night),
  parchment: PALETTE.P!.day,
  grassHex: PALETTE.G!.day
}
