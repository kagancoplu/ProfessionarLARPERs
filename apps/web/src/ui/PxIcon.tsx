import { cn } from './cn'
import { ICONS, ICON_COUNT, type IconName } from './icons.generated'

export type { IconName }

export interface PxIconProps {
  name: IconName
  /** integer scale only (DESIGN.md) */
  zoom?: 1 | 2 | 3 | 4 | 6 | 8
  className?: string
  title?: string
}

/** A 16×16 pixel icon from public/ui/icons.png (Kenmi Cute Fantasy icons + a few drawn in the same style). */
export function PxIcon ({ name, zoom = 2, className, title }: PxIconProps) {
  const size = 16 * zoom
  return (
    <span
      className={cn('pixelated inline-block shrink-0 align-middle', className)}
      role={title !== undefined ? 'img' : undefined} aria-label={title} aria-hidden={title === undefined ? true : undefined} data-icon={name}
      style={{ width: size, height: size, backgroundImage: 'url(/ui/icons.png)', backgroundSize: `${ICON_COUNT * size}px ${size}px`, backgroundPosition: `-${ICONS[name] * size}px 0`, backgroundRepeat: 'no-repeat' }}
    />
  )
}
