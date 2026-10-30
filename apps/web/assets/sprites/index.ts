import { board } from './board'
import { house, gate, stall, workshop } from './buildings'
import { coin } from './coin'
import { hourglass } from './hourglass'
import { bell, cart, chest, tree } from './props'
import { sack } from './sack'
import { shield } from './shield'
import { tileDirt, tileGrass, tileRoad } from './tiles'
import type { SpriteSource } from './types'
import { stranger, villagerEval, villagerFinetune, villagerInference, villagerVisitor } from './villager'

export type { SpriteSource }
export const SPRITES: SpriteSource[] = [
  board, sack, coin, hourglass, shield, tileGrass, tileDirt, tileRoad,
  villagerFinetune, villagerEval, villagerInference, villagerVisitor, stranger,
  workshop, house, stall, gate, chest, bell, cart, tree
]
/** Ground tiles in tileset order (public/game/ground.png): gid 1 grass A, 2 grass B, 3 dirt, 4 road. */
export const GROUND_TILES: Array<{ sprite: SpriteSource, frame: number }> = [
  { sprite: tileGrass, frame: 0 }, { sprite: tileGrass, frame: 1 }, { sprite: tileDirt, frame: 0 }, { sprite: tileRoad, frame: 0 }
]
