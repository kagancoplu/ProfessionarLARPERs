/** HTML labels inside the Phaser world (crisp pixel fonts, follow camera and zoom). */
import type Phaser from 'phaser'

export type LabelTone = 'ink' | 'parchment' | 'danger' | 'gold' | 'grass'

const TONE_STYLE: Record<LabelTone, string> = {
  ink: 'background:var(--surface-2);color:var(--ink);border:1px solid var(--ink);',
  parchment: 'background:var(--surface-2);color:var(--ink);border:1px solid var(--wood);',
  danger: 'background:var(--danger);color:var(--surface-2);border:1px solid var(--danger-dark);',
  gold: 'background:var(--gold);color:var(--ink);border:1px solid var(--gold-dark);',
  grass: 'background:var(--grass);color:var(--ink);border:1px solid var(--grass-dark);'
}

export function makeLabel (scene: Phaser.Scene, x: number, y: number, text: string, opts: { tone?: LabelTone, size?: number, font?: 'display' | 'body' | 'counter', maxWidth?: number } = {}): Phaser.GameObjects.DOMElement {
  const el = scene.add.dom(x, y, 'div', `
    font-family: var(--font-${opts.font ?? 'display'}); font-size: ${opts.size ?? 6}px; line-height: 1.25; padding: 1px 2px; white-space: ${opts.maxWidth !== undefined ? 'normal' : 'nowrap'};
    ${opts.maxWidth !== undefined ? `max-width:${opts.maxWidth}px;` : ''} ${TONE_STYLE[opts.tone ?? 'parchment']} box-shadow: 1px 1px 0 var(--ink); pointer-events: none; text-align: left;
  `)
  el.setHTML(text)
  el.setOrigin(0.5, 1)
  return el
}
