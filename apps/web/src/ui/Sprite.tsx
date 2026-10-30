import { useEffect, useState } from 'react'
import { cn } from './cn'
import { SPRITE_DATA, type SpriteName } from './sprites.generated'

export type { SpriteName }

export interface SpriteProps {
  name: SpriteName
  /** integer scale only (DESIGN.md) */
  zoom?: 1 | 2 | 3 | 4 | 6 | 8
  /** frame index; omit to animate when the sprite has fps */
  frame?: number
  className?: string
  title?: string
}

/** Code-drawn pixel sprite as crisp SVG rects; colours are CSS variables, so night mode swaps for free. */
export function Sprite ({ name, zoom = 2, frame, className, title }: SpriteProps) {
  const data = SPRITE_DATA[name]
  const animated = frame === undefined && data.fps > 0 && data.frames.length > 1
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!animated) return
    const id = setInterval(() => setTick(t => t + 1), 1000 / data.fps)
    return () => clearInterval(id)
  }, [animated, data.fps])
  const idx = frame ?? (animated ? tick % data.frames.length : 0)
  const runs = data.frames[Math.min(idx, data.frames.length - 1)] ?? []
  return (
    <svg className={cn('inline-block shrink-0 align-middle', className)} width={data.w * zoom} height={data.h * zoom} viewBox={`0 0 ${data.w} ${data.h}`}
      shapeRendering="crispEdges" role={title !== undefined ? 'img' : undefined} aria-label={title} aria-hidden={title === undefined ? true : undefined} data-sprite={name}>
      {runs.map(([x, y, w, color], i) => <rect key={i} x={x} y={y} width={w} height={1} fill={`var(--px-${PALETTE_NAMES[color] ?? 'ink'})`} />)}
    </svg>
  )
}

/** palette letter → token name (mirrors assets/palette.ts; the generator validates the letters) */
const PALETTE_NAMES: Record<string, string> = {
  K: 'ink', k: 'ink-muted', P: 'parchment', p: 'parchment-light', W: 'wood', D: 'wood-dark', w: 'wood-light',
  Y: 'gold', y: 'gold-dark', G: 'grass', g: 'grass-dark', R: 'danger', r: 'danger-dark', S: 'sky', B: 'water',
  O: 'warn', T: 'dirt', t: 'dirt-light', s: 'stone', c: 'cream'
}
