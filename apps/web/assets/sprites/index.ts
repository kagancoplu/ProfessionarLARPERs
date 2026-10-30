import { board } from './board'
import { coin } from './coin'
import { hourglass } from './hourglass'
import { sack } from './sack'
import { shield } from './shield'
import { tileDirt, tileGrass, tileRoad } from './tiles'
import type { SpriteSource } from './types'

export type { SpriteSource }
export const SPRITES: SpriteSource[] = [board, sack, coin, hourglass, shield, tileGrass, tileDirt, tileRoad]
