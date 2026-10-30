import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export interface SignboardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** wooden title plate */
  title?: ReactNode
  actions?: ReactNode
  tone?: 'default' | 'danger' | 'ok'
  as?: 'section' | 'article' | 'div'
}

/** The card (DESIGN.md, E-V1): parchment body inside a wooden 9-slice frame (public/ui/frame-wood.png), hard shadow, optional title plate. */
export function Signboard ({ title, actions, tone = 'default', as: Tag = 'section', className, children, ...rest }: SignboardProps) {
  const plate = tone === 'danger' ? 'bg-danger-dark' : tone === 'ok' ? 'bg-grass-dark' : 'bg-wood-dark'
  return (
    <Tag className={cn('frame-wood bg-surface-2 shadow-hard', className)} data-tone={tone} {...rest}>
      {title !== undefined && (
        <header className={cn('flex items-center justify-between gap-3 px-4 py-1.5 text-surface-2', plate)}>
          <h3 className="text-surface-2 text-[16px] leading-6">{title}</h3>
          {actions !== undefined && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </Tag>
  )
}
