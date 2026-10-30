/** Phaser config (track-E §5.2): 16×16 tiles at 3×, pixelArt, no antialias. The Town scene arrives in P1. */
import type Phaser from 'phaser'
import { COLORS } from './colors'

export const TILE = 16
export const SCALE = 3
export const LOGICAL = { width: 960, height: 540 }

export function gameConfig (parent: HTMLElement, scenes: Phaser.Types.Scenes.SceneType[], PhaserLib: typeof Phaser): Phaser.Types.Core.GameConfig {
  return {
    type: PhaserLib.AUTO,
    parent,
    width: LOGICAL.width,
    height: LOGICAL.height,
    backgroundColor: COLORS.parchment,
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    scale: { mode: PhaserLib.Scale.FIT, autoCenter: PhaserLib.Scale.CENTER_BOTH },
    scene: scenes
  }
}
