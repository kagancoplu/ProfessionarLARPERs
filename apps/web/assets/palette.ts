/**
 * Sprite palette (track-E §6.2): one letter per colour, same hexes as src/ui/tokens.css where a
 * token exists, plus the tile colours. Day values are baked into the Phaser atlas; the React
 * <Sprite> uses CSS variables (`--px-<name>`), so night mode swaps for free.
 * No colour outside this table may appear in a sprite (tools/sprites.mjs refuses it).
 */
export interface PaletteEntry { name: string, day: string, night: string }

export const PALETTE: Record<string, PaletteEntry> = {
  K: { name: 'ink', day: '#2A1E14', night: '#F1E7D0' },
  k: { name: 'ink-muted', day: '#6B5A48', night: '#B4A68E' },
  P: { name: 'parchment', day: '#F3E6C8', night: '#2D3842' },
  p: { name: 'parchment-light', day: '#FBF3DF', night: '#3A4855' },
  W: { name: 'wood', day: '#7A4A1F', night: '#7A4A1F' },
  D: { name: 'wood-dark', day: '#4E2E12', night: '#3A2210' },
  w: { name: 'wood-light', day: '#B98650', night: '#A8703A' },
  Y: { name: 'gold', day: '#E0A526', night: '#F2BE45' },
  y: { name: 'gold-dark', day: '#9C6B10', night: '#B98A1E' },
  G: { name: 'grass', day: '#5E9E3E', night: '#2F5A2A' },
  g: { name: 'grass-dark', day: '#3C6E2A', night: '#1F3F1C' },
  R: { name: 'danger', day: '#C8402E', night: '#E85D47' },
  r: { name: 'danger-dark', day: '#8C2418', night: '#B23A28' },
  S: { name: 'sky', day: '#7EC8E3', night: '#2B3F57' },
  B: { name: 'water', day: '#3F7FB5', night: '#1F3B5C' },
  O: { name: 'warn', day: '#D97B21', night: '#F09A3E' },
  T: { name: 'dirt', day: '#B98A5A', night: '#5A4630' },
  t: { name: 'dirt-light', day: '#D9B77E', night: '#6E5840' },
  s: { name: 'stone', day: '#9A9388', night: '#4A4A50' },
  c: { name: 'cream', day: '#FFF6E0', night: '#D9CFBA' }
}

export const TRANSPARENT = '.'
