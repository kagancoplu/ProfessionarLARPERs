/** Keyboard shortcuts (track-E 4.4): letters only, never while typing in a field or with a modifier held. */
import type { AppStoreApi } from '../store'

export const SHORTCUTS: Record<string, string> = { t: '/', p: '/pools', a: '/agents', e: '/explorer', k: '/market', o: '/owner' }

export function isTypingTarget (el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export function handleShortcut (e: KeyboardEvent, store: AppStoreApi, navigate: (to: string) => void): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return false
  const key = e.key.toLowerCase()
  const to = SHORTCUTS[key]
  if (to !== undefined) { navigate(to); return true }
  if (key === 'm') { const s = store.getState(); s.updateSettings({ sound: !s.settings.sound }); return true }
  if (key === 'n') { const s = store.getState(); const night = typeof document !== 'undefined' ? document.documentElement.dataset.theme === 'night' : false; s.updateSettings({ theme: night ? 'day' : 'night' }); return true }
  if (e.key === '?') { try { localStorage.removeItem('agentcoop.tour') } catch { /* private mode */ } navigate('/'); return true }
  return false
}
