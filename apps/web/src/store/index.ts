/**
 * The Zustand store (vanilla + React hook). Everything user-visible reads from here; events
 * enter through `applyEvent` (reducers.ts), REST results through the `hydrate*` setters.
 * Phaser subscribes with `store.subscribe` and writes only the `ui` slice.
 */
import { createStore as createVanillaStore, type StoreApi as ZustandStoreApi } from 'zustand/vanilla'
import { useStore as useZustandStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import type { AgentInfo, ApiPool, GuardDecision, GuardPolicy, Listing, PledgeView, VaultView } from '../api/types'
import type { DataMode, ServiceName } from '../env'
import type { CoopEvent } from '../events/types'
import { applyUnknownEvent, poolEntryFromApi } from './reducers'
import { DEFAULT_SETTINGS, TOAST_LIMIT, initialData, type DrawerKind, type MeState, type ServiceHealth, type Settings, type StoreData, type Toast } from './types'

export interface StoreActions {
  applyEvent: (e: CoopEvent) => void
  hydratePools: (pools: ApiPool[], ts?: string) => void
  setPledges: (poolId: string, pledges: PledgeView[]) => void
  hydrateListings: (listings: Listing[]) => void
  hydrateAgents: (agents: AgentInfo[], ts?: string) => void
  hydrateVaults: (vaults: VaultView[]) => void
  setVaultPolicy: (vaultId: string, policy: GuardPolicy, updatedAt: string) => void
  setVaultDecisions: (vaultId: string, decisions: GuardDecision[]) => void
  setHealth: (service: ServiceName, h: ServiceHealth) => void
  setMe: (patch: Partial<MeState>) => void
  setMode: (mode: DataMode, replayName?: string) => void
  openDrawer: (kind: DrawerKind, id: string) => void
  closeDrawer: () => void
  pushToast: (toast: Omit<Toast, 'id' | 'ts'>) => void
  dismissToast: (id: string) => void
  markNotificationsRead: () => void
  dismissNotification: (id: string) => void
  updateSettings: (patch: Partial<Settings>) => void
  setNarrowScreen: (narrow: boolean) => void
  reset: (mode?: DataMode, replayName?: string) => void
}

export type AppStore = StoreData & StoreActions
export type AppStoreApi = ZustandStoreApi<AppStore>

const SETTINGS_KEY = 'agentcoop.settings.v1'

function loadSettings (): Settings {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SETTINGS_KEY) : null
    if (raw === null) return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings (s: Settings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch { /* private mode */ }
}

let toastSeq = 0

export function createAppStore (mode: DataMode = 'live', replayName?: string, settings: Settings = loadSettings()): AppStoreApi {
  return createVanillaStore<AppStore>()((set) => ({
    ...initialData(mode, replayName),
    settings,
    applyEvent: e => set(s => applyUnknownEvent(s, e)),
    hydratePools: (pools, ts = new Date().toISOString()) => set(s => {
      const byId = { ...s.pools.byId }
      const order = [...s.pools.order]
      for (const p of pools) {
        byId[p.poolId] = poolEntryFromApi(p, ts, byId[p.poolId])
        if (!order.includes(p.poolId)) order.push(p.poolId)
      }
      return { pools: { byId, order } }
    }),
    setPledges: (poolId, pledges) => set(s => {
      const p = s.pools.byId[poolId]
      if (p === undefined) return {}
      return { pools: { ...s.pools, byId: { ...s.pools.byId, [poolId]: { ...p, pledges } } } }
    }),
    hydrateListings: listings => set({ listings: { byOutpoint: Object.fromEntries(listings.map(l => [l.outpoint, l])) } }),
    hydrateAgents: (agents, ts = new Date().toISOString()) => set(s => ({
      agents: {
        byIdentity: {
          ...s.agents.byIdentity,
          ...Object.fromEntries(agents.map(a => [a.identity, { ...(s.agents.byIdentity[a.identity] ?? { decisions: [], lastSeen: ts }), ...a }]))
        }
      }
    })),
    hydrateVaults: vaults => set(s => ({
      vaults: { byId: { ...s.vaults.byId, ...Object.fromEntries(vaults.map(v => [v.vaultId, { ...(s.vaults.byId[v.vaultId] ?? { decisions: [] }), ...v }])) } }
    })),
    setVaultPolicy: (vaultId, policy, updatedAt) => set(s => {
      const v = s.vaults.byId[vaultId]
      if (v === undefined) return {}
      return { vaults: { byId: { ...s.vaults.byId, [vaultId]: { ...v, policy, policyUpdatedAt: updatedAt } } } }
    }),
    setVaultDecisions: (vaultId, decisions) => set(s => {
      const v = s.vaults.byId[vaultId]
      if (v === undefined) return {}
      return { vaults: { byId: { ...s.vaults.byId, [vaultId]: { ...v, decisions } } } }
    }),
    setHealth: (service, h) => set(s => ({ health: { ...s.health, [service]: h } })),
    setMe: patch => set(s => ({ me: { ...s.me, ...patch } })),
    setMode: (mode, replayName) => set({ mode, ...(replayName !== undefined ? { replayName } : {}) }),
    openDrawer: (kind, id) => set(s => ({ ui: { ...s.ui, drawer: { kind, id } } })),
    closeDrawer: () => set(s => { const { drawer: _d, ...rest } = s.ui; return { ui: rest } }),
    pushToast: toast => set(s => ({ ui: { ...s.ui, toasts: [...s.ui.toasts, { ...toast, id: `toast:local:${++toastSeq}`, ts: new Date().toISOString() }].slice(-TOAST_LIMIT) } })),
    dismissToast: id => set(s => ({ ui: { ...s.ui, toasts: s.ui.toasts.filter(t => t.id !== id) } })),
    markNotificationsRead: () => set(s => ({ notifications: s.notifications.map(n => (n.read ? n : { ...n, read: true })) })),
    dismissNotification: id => set(s => ({ notifications: s.notifications.filter(n => n.id !== id) })),
    updateSettings: patch => set(s => { const next = { ...s.settings, ...patch }; saveSettings(next); return { settings: next } }),
    setNarrowScreen: narrow => set(s => (s.ui.narrowScreen === narrow ? {} : { ui: { ...s.ui, narrowScreen: narrow } })),
    reset: (mode = 'live', replayName) => set(s => ({ ...initialData(mode, replayName), settings: s.settings }))
  }))
}

/** The app-wide store. Tests create their own with `createAppStore`. */
export const store: AppStoreApi = createAppStore()

export function useStore<T> (selector: (s: AppStore) => T): T {
  return useZustandStore(store, selector)
}

/** For selectors that build a new array/object each call (filters, maps, sorts): shallow-compared, so no render loops. */
export function useShallowStore<T> (selector: (s: AppStore) => T): T {
  return useZustandStore(store, useShallow(selector))
}
