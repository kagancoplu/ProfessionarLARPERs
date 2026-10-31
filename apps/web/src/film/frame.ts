/**
 * Film framing (no Phaser here, so scripts and tests can import it): the canvas is 1920×1080; zoom 6 shows
 * 320×180 world px (close), 4 shows 480×270 (medium), 3 shows 640×360 (wide), 2.5 the whole map's width.
 */
export const FILM_W = 1920
export const FILM_H = 1080
export const ZOOM = { close: 6, medium: 4, wide: 3, map: 2.5 } as const
/** a narrator speaks about 2.6 words a second (ElevenLabs' default pace is close to it) */
export const WORDS_PER_SECOND = 2.6
