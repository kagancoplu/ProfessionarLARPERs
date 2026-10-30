import { useEffect } from 'react'
import { store, useStore } from '../store'
import { selectToasts } from '../store/selectors'
import { cn } from './cn'

const TONE = { info: 'border-wood', success: 'border-grass-dark', error: 'border-danger-dark', warn: 'border-warn' }

/** Bottom-right stack of mini signboards; 5 s each, pause on hover. */
export function Toasts () {
  const toasts = useStore(selectToasts)
  return (
    <div className="fixed right-4 bottom-4 z-50 flex w-[360px] max-w-[calc(100vw-32px)] flex-col gap-2" aria-live="polite">
      {toasts.map(t => <ToastItem key={t.id} id={t.id} text={t.text} tone={t.kind} />)}
    </div>
  )
}

function ToastItem ({ id, text, tone }: { id: string, text: string, tone: keyof typeof TONE }) {
  useEffect(() => {
    let timer = setTimeout(() => store.getState().dismissToast(id), 5_000)
    const el = document.getElementById(id)
    const pause = (): void => clearTimeout(timer)
    const resume = (): void => { timer = setTimeout(() => store.getState().dismissToast(id), 2_000) }
    el?.addEventListener('mouseenter', pause)
    el?.addEventListener('mouseleave', resume)
    return () => { clearTimeout(timer); el?.removeEventListener('mouseenter', pause); el?.removeEventListener('mouseleave', resume) }
  }, [id])
  return (
    <div id={id} className={cn('steps-in flex items-start justify-between gap-3 border-2 bg-surface-2 px-3 py-2 shadow-hard', TONE[tone])} role="status">
      <span className="text-[14px] leading-5">{text}</span>
      <button type="button" onClick={() => store.getState().dismissToast(id)} aria-label="Dismiss" className="font-display leading-5 text-ink-muted hover:text-ink">×</button>
    </div>
  )
}
