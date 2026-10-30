import type { SpriteSource } from './types'

/** Loading state: a pixel hourglass, 12×16, 2 frames (sand on top / sand at the bottom). */
export const hourglass: SpriteSource = {
  name: 'hourglass',
  w: 12,
  h: 16,
  fps: 2,
  frames: [
    [
      'WWWWWWWWWWWW',
      'WDDDDDDDDDDW',
      '.KtttttttK..',
      '.KtttttttK..',
      '..KtttttK...',
      '...KtttK....',
      '....KtK.....',
      '.....K......',
      '....KpK.....',
      '...KpppK....',
      '..KpppppK...',
      '.KpppppppK..',
      '.KpppppppK..',
      '.KpppppppK..',
      'WDDDDDDDDDDW',
      'WWWWWWWWWWWW'
    ],
    [
      'WWWWWWWWWWWW',
      'WDDDDDDDDDDW',
      '.KpppppppK..',
      '.KpppppppK..',
      '..KpppppK...',
      '...KpppK....',
      '....KtK.....',
      '.....t......',
      '....KtK.....',
      '...KtttK....',
      '..KtttttK...',
      '.KtttttttK..',
      '.KtttttttK..',
      '.KtttttttK..',
      'WDDDDDDDDDDW',
      'WWWWWWWWWWWW'
    ]
  ]
}
