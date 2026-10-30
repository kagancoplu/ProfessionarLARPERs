/** Day/night: settings 'auto' follows prefers-color-scheme; the html[data-theme] attribute is always explicit. */
import type { AppStoreApi } from './store'

export function resolveTheme (setting: 'day' | 'night' | 'auto', prefersDark: boolean): 'day' | 'night' {
  return setting === 'auto' ? (prefersDark ? 'night' : 'day') : setting
}

export function startThemeController (store: AppStoreApi): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = (): void => {
    const theme = resolveTheme(store.getState().settings.theme, mq.matches)
    document.documentElement.dataset.theme = theme
  }
  apply()
  mq.addEventListener('change', apply)
  const unsub = store.subscribe((s, prev) => { if (s.settings.theme !== prev.settings.theme) apply() })
  return () => { mq.removeEventListener('change', apply); unsub() }
}
