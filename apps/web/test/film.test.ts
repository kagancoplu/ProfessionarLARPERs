import { describe, expect, it } from 'vitest'
import { FILMS } from '../src/film/films'
import { WORDS_PER_SECOND } from '../src/film/frame'

describe('film scripts', () => {
  for (const [name, film] of Object.entries(FILMS)) {
    describe(name, () => {
      it('narration is in order, does not overlap, and ends before the film', () => {
        let end = 0
        for (const l of film.narration) {
          expect(l.at).toBeGreaterThanOrEqual(end)
          end = l.at + l.sec
        }
        expect(end).toBeLessThanOrEqual(film.duration)
      })
      it('every narrator line can be spoken in the time it is given', () => {
        for (const l of film.narration) {
          const words = l.text.split(/\s+/).filter(Boolean).length
          expect(words / WORDS_PER_SECOND, l.text).toBeLessThanOrEqual(l.sec)
        }
      })
    })
  }
})
