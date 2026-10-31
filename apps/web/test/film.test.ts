import { describe, expect, it } from 'vitest'
import { WORDS_PER_SECOND } from '../src/film/frame'
import { duration, lines, LINES, SEGMENTS } from '../src/film/narration'

describe('film narration', () => {
  it('the video is 2:30 and every line belongs to a segment', () => {
    expect(SEGMENTS.reduce((a, s) => a + s.sec, 0)).toBe(150)
    for (const l of LINES) expect(SEGMENTS.map(s => s.id)).toContain(l.segment)
    expect(new Set(LINES.map(l => l.id)).size).toBe(LINES.length)
  })
  for (const { id } of SEGMENTS) {
    it(`${id}: lines are in order, do not overlap, and end inside the segment`, () => {
      let end = 0
      for (const l of lines(id)) {
        expect(l.at, l.id).toBeGreaterThanOrEqual(end)
        end = l.at + l.sec
      }
      expect(end).toBeLessThanOrEqual(duration(id))
    })
  }
  it('every line can be spoken in the time it is given', () => {
    for (const l of LINES) {
      const words = (l.say ?? l.text).split(/\s+/).filter(Boolean).length
      expect(words / WORDS_PER_SECOND, l.id).toBeLessThanOrEqual(l.sec + 1.5)
    }
  })
})
