import { useEffect, type ReactNode } from 'react'
import { cn } from './cn'

export interface ScrollProps {
  open: boolean
  title: ReactNode
  onClose?: () => void
  children: ReactNode
  footer?: ReactNode
  className?: string
  /** dialog test id */
  id?: string
}

/** The parchment modal: every confirmation goes through it (what, how many sats, which address → Approve in BSV Desktop → txid). */
export function Scroll ({ open, title, onClose, children, footer, className, id }: ScrollProps) {
  useEffect(() => {
    if (!open || onClose === undefined) return
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4" role="presentation" onClick={onClose}>
      <div id={id} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} onClick={e => e.stopPropagation()}
        className={cn('steps-in w-full max-w-[560px] border-2 border-ink bg-surface-2 shadow-hard-lg', className)}>
        <div className="h-1 bg-wood" aria-hidden />
        <div className="h-1 bg-wood-light" aria-hidden />
        <header className="flex items-center justify-between gap-3 px-5 pt-4">
          <h2 className="text-[24px] leading-8">{title}</h2>
          {onClose !== undefined && <button type="button" onClick={onClose} aria-label="Close" className="font-display border-2 border-ink px-2 leading-6 hover:bg-surface-3">×</button>}
        </header>
        <div className="px-5 py-4">{children}</div>
        {footer !== undefined && <footer className="flex items-center justify-end gap-2 border-t border-surface-3 px-5 py-3">{footer}</footer>}
        <div className="h-1 bg-wood-light" aria-hidden />
        <div className="h-1 bg-wood" aria-hidden />
      </div>
    </div>
  )
}
