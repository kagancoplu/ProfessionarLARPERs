import type { SpriteSource } from './types'

const rep = (row: string, n: number): string[] => Array.from({ length: n }, () => row)

/** Ground tiles, 16×16: grass (2 variants), dirt, road. Used by the Town map until Kenney tiles are aligned. */
export const tileGrass: SpriteSource = {
  name: 'tile_grass',
  w: 16,
  h: 16,
  frames: [
    [...rep('GGGGGGGGGGGGGGGG', 3), 'GGGGgGGGGGGGGGGG', ...rep('GGGGGGGGGGGGGGGG', 4), 'GGGGGGGGGGGgGGGG', ...rep('GGGGGGGGGGGGGGGG', 3), 'GGgGGGGGGGGGGGGG', ...rep('GGGGGGGGGGGGGGGG', 3)],
    [...rep('GGGGGGGGGGGGGGGG', 2), 'GGGGGGGGGgGgGGGG', ...rep('GGGGGGGGGGGGGGGG', 5), 'GGgGGGGGGGGGGGGG', 'GGGGGGGGGGGGGGGG', 'GGGGGGGGGGGGGgGG', ...rep('GGGGGGGGGGGGGGGG', 5)]
  ]
}

export const tileDirt: SpriteSource = {
  name: 'tile_dirt',
  w: 16,
  h: 16,
  frames: [[...rep('TTTTTTTTTTTTTTTT', 2), 'TTTtTTTTTTTTtTTT', ...rep('TTTTTTTTTTTTTTTT', 4), 'TTTTTTTTtTTTTTTT', ...rep('TTTTTTTTTTTTTTTT', 3), 'TtTTTTTTTTTTTTTT', ...rep('TTTTTTTTTTTTTTTT', 4)]]
}

export const tileRoad: SpriteSource = {
  name: 'tile_road',
  w: 16,
  h: 16,
  frames: [['ssssssssssssssss', 'sKssssKssssKssss', 'ssssssssssssssss', 'ssssKssssKssssss', 'ssssssssssssssss', 'ssKssssKssssKsss', 'ssssssssssssssss', 'sssssKssssKsssss', 'ssssssssssssssss', 'sKssssKssssKssss', 'ssssssssssssssss', 'ssssKssssKssssss', 'ssssssssssssssss', 'ssKssssKssssKsss', 'ssssssssssssssss', 'sssssKssssKsssss']]
}
