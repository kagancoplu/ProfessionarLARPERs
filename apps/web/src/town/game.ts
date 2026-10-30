/** Phaser constants (E-V1): 16 px tiles, integer camera zoom, pixelArt. The canvas follows its parent (Scale.RESIZE). */
export const TILE = 16
export const ZOOM_DEFAULT = 3
export const ZOOM_MIN = 2
export const ZOOM_MAX = 4
/** depth bands: ground 0, decor 1, world objects = their y (0..600), overlay 900, lights 901, labels follow their container */
export const DEPTH = { overlay: 900, lights: 901, banner: 950 }
