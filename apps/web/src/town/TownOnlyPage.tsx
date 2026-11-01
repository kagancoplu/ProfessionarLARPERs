/**
 * /town — the Town alone, filling the window: no top bar, consoles, tour, counters or feed. For a page that hosts
 * the game in an iframe (the mock walkthrough with `?mode=mock`, walking from the start with `?avatar=1`).
 * Kept from the app: the drawer that `E` or a click opens, the narrator, toasts and the mock Desktop's approval
 * window (a drawer's action may ask for it). Keys: V walk, M sound, N day/night; the console letters do nothing here.
 */
import { lazy, Suspense, useEffect } from 'react'
import { useRuntime } from '../app-context'
import { MockApprovalDialog } from '../shell/AppShell'
import { handleShortcut, SHORTCUTS } from '../shell/shortcuts'
import { store } from '../store'
import { LoadingState, Toasts } from '../ui'

const TownCanvas = lazy(() => import('./TownCanvas'))

export default function TownOnlyPage () {
  const { replay } = useRuntime()
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const key = e.key.toLowerCase()
      if (SHORTCUTS[key] !== undefined || e.key === '?') return
      if (handleShortcut(e, store, () => {}, replay)) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [replay])
  return (
    <div className="h-screen w-screen overflow-hidden bg-ink">
      <Suspense fallback={<div className="flex h-full items-center justify-center"><LoadingState title="Building the town…" /></div>}><TownCanvas fill /></Suspense>
      <Toasts />
      <MockApprovalDialog />
    </div>
  )
}
