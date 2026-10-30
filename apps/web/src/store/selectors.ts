import type { ApiPoolStatus } from '../api/types'
import type { AppStore } from './index'
import type { PoolEntry } from './types'

export const selectPools = (status?: ApiPoolStatus | ApiPoolStatus[]) => (s: AppStore): PoolEntry[] => {
  const wanted = status === undefined ? undefined : new Set(Array.isArray(status) ? status : [status])
  return s.pools.order.map(id => s.pools.byId[id]).filter((p): p is PoolEntry => p !== undefined && (wanted === undefined || wanted.has(p.status)))
}
export const selectAgents = (s: AppStore) => Object.values(s.agents.byIdentity).sort((a, b) => a.name.localeCompare(b.name))
export const selectTxs = (s: AppStore) => s.txs
export const selectFeed = (s: AppStore) => s.feed
export const selectUnread = (s: AppStore): number => s.notifications.filter(n => !n.read).length
export const selectSignRequests = (s: AppStore) => s.notifications.filter(n => n.kind === 'sign_request')
export const selectHealth = (s: AppStore) => s.health
export const selectMe = (s: AppStore) => s.me
export const selectMode = (s: AppStore) => s.mode
export const selectMetrics = (s: AppStore) => s.metrics
export const selectDrawer = (s: AppStore) => s.ui.drawer
export const selectToasts = (s: AppStore) => s.ui.toasts
export const selectSettings = (s: AppStore) => s.settings
export const selectVaults = (s: AppStore) => Object.values(s.vaults.byId).sort((a, b) => a.vaultId.localeCompare(b.vaultId))
export const selectListings = (s: AppStore) => Object.values(s.listings.byOutpoint).sort((a, b) => Number(a.askSats) / Number(a.credits) - Number(b.askSats) / Number(b.credits))
/** every guard refusal seen, newest first (owner console "Denials", Town guard) */
export const selectDenials = (s: AppStore) => Object.values(s.vaults.byId).flatMap(v => v.decisions.filter(d => d.outcome === 'denied')).sort((a, b) => b.ts.localeCompare(a.ts))
