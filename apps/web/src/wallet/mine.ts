/** My pledges and provider records, per identity, persisted in localStorage (never keys; only outpoints and key ids). */
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { MyPledge, MyVault } from './flows/types'

export interface MyPool { poolId: string, nonce: string, label: string, txid: string, createdAt: string, offerTxid?: string }

interface MineState {
  identity?: string
  pledges: MyPledge[]
  pools: MyPool[]
  vaults: MyVault[]
  tokenId?: string
  load: (identity: string | undefined) => void
  upsertPledge: (p: MyPledge) => void
  patchPledge: (outpoint: string, patch: Partial<MyPledge>) => void
  addPool: (p: MyPool) => void
  setTokenId: (tokenId: string | undefined) => void
  addVault: (v: MyVault) => void
  patchVault: (vaultId: string, patch: Partial<MyVault>) => void
}

const key = (identity: string): string => `agentcoop.mine.${identity.slice(0, 16)}`

/** localStorage when the browser allows it; an in-memory map otherwise (private mode, tests under node). */
const memory = new Map<string, string>()
const storage = {
  get: (k: string): string | null => { try { return typeof localStorage !== 'undefined' ? localStorage.getItem(k) : memory.get(k) ?? null } catch { return memory.get(k) ?? null } },
  set: (k: string, v: string): void => { memory.set(k, v); try { if (typeof localStorage !== 'undefined') localStorage.setItem(k, v) } catch { /* private mode */ } }
}

function read (identity: string): Pick<MineState, 'pledges' | 'pools' | 'vaults' | 'tokenId'> {
  try {
    const raw = storage.get(key(identity))
    if (raw === null) return { pledges: [], pools: [], vaults: [] }
    const parsed = JSON.parse(raw) as Partial<Pick<MineState, 'pledges' | 'pools' | 'vaults' | 'tokenId'>>
    return { pledges: parsed.pledges ?? [], pools: parsed.pools ?? [], vaults: parsed.vaults ?? [], ...(parsed.tokenId !== undefined ? { tokenId: parsed.tokenId } : {}) }
  } catch { return { pledges: [], pools: [], vaults: [] } }
}

function write (s: MineState): void {
  if (s.identity === undefined) return
  storage.set(key(s.identity), JSON.stringify({ pledges: s.pledges, pools: s.pools, vaults: s.vaults, tokenId: s.tokenId }))
}

export const mine = createStore<MineState>()((set, get) => ({
  pledges: [],
  pools: [],
  vaults: [],
  load: identity => { set(identity === undefined ? { identity: undefined, pledges: [], pools: [], vaults: [], tokenId: undefined } : { identity, ...read(identity) }) },
  upsertPledge: p => { set(s => ({ pledges: [p, ...s.pledges.filter(x => x.outpoint !== p.outpoint)] })); write(get()) },
  patchPledge: (outpoint, patch) => { set(s => ({ pledges: s.pledges.map(p => (p.outpoint === outpoint ? { ...p, ...patch } : p)) })); write(get()) },
  addPool: p => { set(s => ({ pools: [p, ...s.pools.filter(x => x.poolId !== p.poolId)] })); write(get()) },
  setTokenId: tokenId => { set({ tokenId }); write(get()) },
  addVault: v => { set(s => ({ vaults: [v, ...s.vaults.filter(x => x.vaultId !== v.vaultId)] })); write(get()) },
  patchVault: (vaultId, patch) => { set(s => ({ vaults: s.vaults.map(v => (v.vaultId === vaultId ? { ...v, ...patch } : v)) })); write(get()) }
}))

export const useMine = <T>(sel: (s: MineState) => T): T => useStore(mine, sel)
export const activePledge = (s: MineState): MyPledge | undefined => s.pledges.find(p => p.status === 'pending' || p.status === 'signed')
