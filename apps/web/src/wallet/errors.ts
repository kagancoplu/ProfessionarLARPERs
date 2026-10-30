/** Translate BSV Desktop / WalletClient failures into one plain sentence (track-E §4.1). */
import { t } from '../i18n/t'

export type WalletErrorKind = 'unreachable' | 'rejected' | 'timeout' | 'unknown'

export function classifyWalletError (err: unknown): WalletErrorKind {
  const msg = String((err as { message?: unknown })?.message ?? err ?? '').toLowerCase()
  if (/timeout|timed out|did not answer/.test(msg)) return 'timeout'
  if (/reject|denied|declin|cancel|user refused|not authorized|permission/.test(msg)) return 'rejected'
  if (/failed to fetch|networkerror|econnrefused|load failed|unreachable|no wallet|not available|substrate|could not connect|404/.test(msg)) return 'unreachable'
  return 'unknown'
}

export function describeWalletError (err: unknown): string {
  switch (classifyWalletError(err)) {
    case 'unreachable': return t('errors.desktopUnreachable')
    case 'rejected': return t('errors.userRejected')
    case 'timeout': return t('errors.timeout')
    default: return t('errors.unknown', { detail: String((err as { message?: unknown })?.message ?? err) })
  }
}
