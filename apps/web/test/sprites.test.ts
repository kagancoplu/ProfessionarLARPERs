import { describe, expect, it } from 'vitest'
import { PALETTE } from '../assets/palette'
import { SPRITES } from '../assets/sprites/index'
import { SPRITE_DATA } from '../src/ui/sprites.generated'

describe('sprite sources', () => {
  it('every frame is w×h and uses only palette letters', () => {
    for (const s of SPRITES) {
      for (const frame of s.frames) {
        expect(frame, s.name).toHaveLength(s.h)
        for (const row of frame) {
          expect(row.length, `${s.name}: "${row}"`).toBe(s.w)
          for (const ch of row) expect(ch === '.' || PALETTE[ch] !== undefined, `${s.name}: '${ch}'`).toBe(true)
        }
      }
    }
  })
  it('generated data matches the sources (run `npm run sprites` after editing a sprite)', () => {
    for (const s of SPRITES) {
      const g = SPRITE_DATA[s.name as keyof typeof SPRITE_DATA]
      expect(g, s.name).toBeDefined()
      expect(g.frames).toHaveLength(s.frames.length)
      expect(g.w).toBe(s.w)
    }
  })
  it('palette hexes are 6-digit and day/night both set', () => {
    for (const p of Object.values(PALETTE)) { expect(p.day).toMatch(/^#[0-9A-F]{6}$/i); expect(p.night).toMatch(/^#[0-9A-F]{6}$/i) }
  })
})
