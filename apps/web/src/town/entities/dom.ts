/** HTML labels inside the Phaser world (crisp pixel fonts, follow camera and zoom); frames from public/ui/label*.png. */
import type Phaser from 'phaser'

export type LabelTone = 'ink' | 'parchment' | 'danger' | 'gold' | 'grass'
const TONE_CLASS: Record<LabelTone, string> = { ink: 'town-label-wood', parchment: '', danger: 'town-label-danger', gold: 'town-label-gold', grass: 'town-label-grass' }

/** `speech` / `thought`: a rounded bubble with a tail (film mode; public/ui/bubble*.png from tools/bubbles.mjs) */
export type LabelShape = 'box' | 'speech' | 'thought'

export function makeLabel (scene: Phaser.Scene, x: number, y: number, text: string, opts: { tone?: LabelTone, size?: number, font?: 'display' | 'body' | 'counter', maxWidth?: number, shape?: LabelShape } = {}): Phaser.GameObjects.DOMElement {
  const bubble = opts.shape === 'speech' || opts.shape === 'thought'
  const el = scene.add.dom(x, y, 'div', `font-size: ${opts.size ?? 6}px; padding: ${bubble ? '1px 3px' : '0 1px'}; ${opts.font !== undefined ? `font-family: var(--font-${opts.font});` : ''} ${opts.maxWidth !== undefined ? `max-width:${opts.maxWidth}px; white-space: normal;` : ''}`)
  el.node.className = bubble ? `town-label town-bubble${opts.shape === 'thought' ? ' town-thought' : ''}` : `town-label ${TONE_CLASS[opts.tone ?? 'parchment']}`.trim()
  el.setHTML(text)
  el.setOrigin(0.5, 1)
  return el
}
