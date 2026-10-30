import { useEffect, type ReactNode } from 'react'
import { cn } from './cn'

/** Right-hand drawer, 440 px, wood frame, one at a time, Esc closes (DESIGN.md). */
export function Drawer ({ open, title, onClose, children, className }: { open: boolean, title: ReactNode, onClose: () => void, children: ReactNode, className?: string }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <aside className={cn('steps-in fixed top-14 right-0 bottom-0 z-40 flex w-[440px] max-w-full flex-col border-l-2 border-wood bg-surface-2 shadow-hard', className)} aria-label={typeof title === 'string' ? title : 'Details'}>
      <header className="flex items-center justify-between gap-3 bg-wood px-4 py-2 text-surface-2">
        <h3 className="text-surface-2 text-[16px] leading-6">{title}</h3>
        <button type="button" onClick={onClose} aria-label="Close" className="font-display border-2 border-surface-2 px-2 leading-6 hover:bg-wood-dark">×</button>
      </header>
      <div className="flex-1 overflow-y-auto p-4">{children}</div>
    </aside>
  )
}
