import type { ReactNode } from 'react'
import { cn } from './cn'
import { PixelButton } from './PixelButton'
import { PxIcon, type IconName } from './PxIcon'

interface StateProps { sprite?: IconName, title: string, body?: ReactNode, action?: ReactNode, className?: string }

/** Never "No data": a sprite, one concrete sentence, one action (DESIGN.md). */
export function EmptyState ({ sprite = 'board', title, body, action, className }: StateProps) {
  return (
    <div className={cn('flex flex-col items-start gap-3 p-6', className)} role="status">
      <PxIcon name={sprite} zoom={3} />
      <p className="font-display text-[20px] leading-7">{title}</p>
      {body !== undefined && <p className="text-ink-muted max-w-prose">{body}</p>}
      {action}
    </div>
  )
}

export function LoadingState ({ title, body, className }: Omit<StateProps, 'sprite' | 'action'>) {
  return (
    <div className={cn('flex items-center gap-3 p-6', className)} role="status" aria-busy>
      <PxIcon name="hourglass" zoom={3} className="blink-steps" />
      <div>
        <p className="font-display text-[20px] leading-7">{title}</p>
        {body !== undefined && <p className="text-ink-muted">{body}</p>}
      </div>
    </div>
  )
}

export function ErrorState ({ title, body, onRetry, retryLabel = 'Retry', className }: Omit<StateProps, 'sprite' | 'action'> & { onRetry?: () => void, retryLabel?: string }) {
  return (
    <div className={cn('frame-parchment flex flex-col items-start gap-3 bg-surface-2 p-4', className)} role="alert">
      <div className="flex items-center gap-3">
        <PxIcon name="shield" zoom={3} />
        <p className="font-display text-[20px] leading-7 text-danger-dark">{title}</p>
      </div>
      {body !== undefined && <p className="max-w-prose">{body}</p>}
      {onRetry !== undefined && <PixelButton variant="secondary" size="sm" onClick={onRetry}>{retryLabel}</PixelButton>}
    </div>
  )
}
