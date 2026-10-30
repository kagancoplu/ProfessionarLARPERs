import { fit, type SpriteSource } from './types'

/**
 * Villagers, 16×24. One source with a placeholder shirt letter `X` that the palette
 * variants replace (finetune = gold, eval = grass, inference = sky). Frames: idle,
 * walk A, walk B (facing right; the Town flips for left), idle-back.
 */
const idle = [
  '......KKKK......',
  '.....KttttK.....',
  '....KttttttK....',
  '....KtcccctK....',
  '....KtcKcKtK....',
  '....KtcccctK....',
  '.....KccccK.....',
  '......KccK......',
  '.....KXXXXK.....',
  '....KXXXXXXK....',
  '...KcXXXXXXcK...',
  '...KcXXXXXXcK...',
  '....KXXXXXXK....',
  '....KXXXXXXK....',
  '.....KDDDDK.....',
  '.....KDDDDK.....',
  '.....KDKKDK.....',
  '.....KDK.KDK....',
  '.....KDK.KDK....',
  '.....KDK.KDK....',
  '.....KKK.KKK....',
  '....KDDK.KDDK...',
  '....KKKK.KKKK...',
  '................'
]
const walkA = idle.map((r, y) => (y === 17 ? '.....KDKKDK.....' : y === 18 ? '....KDDKKKDK....' : y === 19 ? '...KDDK...KDK...' : y === 20 ? '...KKK....KKK...' : y === 21 ? '..KDDK....KDDK..' : y === 22 ? '..KKKK....KKKK..' : r))
const walkB = idle.map((r, y) => (y === 17 ? '......KDDK......' : y === 18 ? '......KDDK......' : y === 19 ? '.....KDDDDK.....' : y === 20 ? '.....KKKKKK.....' : y === 21 ? '....KDDKKDDK....' : y === 22 ? '....KKKK.KKKK...' : r))
const back = idle.map((r, y) => (y >= 3 && y <= 7 ? r.replace(/c/g, 't').replace(/K(?=t)/g, 'K') : r))

const make = (name: string, shirt: string): SpriteSource => ({
  name, w: 16, h: 24, fps: 6,
  frames: [idle, walkA, walkB, back].map(f => fit(f.map(row => row.replace(/X/g, shirt)), 16, 24))
})

export const villagerFinetune = make('villager_finetune', 'Y')
export const villagerEval = make('villager_eval', 'G')
export const villagerInference = make('villager_inference', 'S')
export const villagerVisitor = make('villager_visitor', 'R')
export const stranger: SpriteSource = {
  name: 'stranger', w: 16, h: 24,
  frames: [fit(idle.map((row, y) => (y <= 2 ? row.replace(/t/g, 'K') : row.replace(/X/g, 'k').replace(/D/g, 'K'))), 16, 24)]
}
