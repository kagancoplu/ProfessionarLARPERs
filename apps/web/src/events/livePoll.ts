/**
 * Live mode: what no event stream announces, polled (found in the P6 cleanup: listings, the agents' roster and
 * vaults were never loaded in live mode). Listings go through deriveListingDiff so the Town's stalls animate;
 * agents and vaults are hydrated. Each source fails quietly (health polling already reports the service).
 */
import type { EventBus } from './bus'
import { deriveListingDiff } from './derive'
import type { AppStoreApi } from '../store'
import type { AgentInfo, Listing, VaultView } from '../api/types'
import { makeEvent, type VaultCreditView } from './types'

export interface LivePollSources {
  listings: () => Promise<Listing[]>
  agents: () => Promise<AgentInfo[]>
  vaults: () => Promise<VaultView[]>
  /** overlay lookup of vault-locked credits by sha256(vault script) */
  vaultCredits?: (vaultHash: string) => Promise<Array<{ tokenId: string, amt: string, sym?: string, spent?: boolean }>>
}

export interface LivePollOptions { listingsMs?: number, agentsMs?: number, vaultsMs?: number, setIntervalImpl?: typeof setInterval, clearIntervalImpl?: typeof clearInterval }

export async function pollListings (bus: EventBus, store: AppStoreApi, src: LivePollSources): Promise<void> {
  const next = await src.listings()
  for (const e of deriveListingDiff(store.getState().listings.byOutpoint, next, new Date().toISOString())) bus.publish(e)
  store.getState().hydrateListings(next)
}

export async function pollAgents (store: AppStoreApi, src: LivePollSources): Promise<void> { store.getState().hydrateAgents(await src.agents()) }
export async function pollVaults (store: AppStoreApi, src: LivePollSources, bus?: EventBus): Promise<void> {
  store.getState().hydrateVaults(await src.vaults())
  if (bus !== undefined && src.vaultCredits !== undefined) await pollVaultCredits(bus, store, src.vaultCredits)
}

export function startLivePolling (bus: EventBus, store: AppStoreApi, src: LivePollSources, opts: LivePollOptions = {}): () => void {
  const every = opts.setIntervalImpl ?? setInterval
  const stop = opts.clearIntervalImpl ?? clearInterval
  const quiet = (p: Promise<void>): void => { void p.catch(() => {}) }
  const runAll = (): void => { quiet(pollListings(bus, store, src)); quiet(pollAgents(store, src)); quiet(pollVaults(store, src, bus)) }
  runAll()
  const timers = [
    every(() => quiet(pollListings(bus, store, src)), opts.listingsMs ?? 10_000),
    every(() => quiet(pollAgents(store, src)), opts.agentsMs ?? 30_000),
    every(() => quiet(pollVaults(store, src, bus)), opts.vaultsMs ?? 20_000)
  ]
  return () => { for (const t of timers) stop(t) }
}

/** sha256(vault script) hex, the overlay's index for vault-locked credits (same as core's vaultScriptHash, without loading core). */
export async function vaultScriptHash (scriptHex: string): Promise<string> {
  const bytes = new Uint8Array((scriptHex.match(/../g) ?? []).map(h => parseInt(h, 16)))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Sum credit outputs per token. */
export function summariseCredits (outputs: Array<{ tokenId: string, amt: string, sym?: string, spent?: boolean }>): VaultCreditView[] {
  const by = new Map<string, VaultCreditView>()
  for (const o of outputs) {
    if (o.spent === true) continue
    const prev = by.get(o.tokenId)
    by.set(o.tokenId, { tokenId: o.tokenId, ...(o.sym !== undefined ? { sym: o.sym } : prev?.sym !== undefined ? { sym: prev.sym } : {}), amt: (BigInt(prev?.amt ?? '0') + BigInt(o.amt)).toString(), utxos: (prev?.utxos ?? 0) + 1 })
  }
  return [...by.values()]
}

/** Credits locked to each known vault, published as vault_credits when they change (so replays record them). */
export async function pollVaultCredits (bus: EventBus, store: AppStoreApi, lookup: (vaultHash: string) => Promise<Array<{ tokenId: string, amt: string, sym?: string, spent?: boolean }>>): Promise<void> {
  for (const v of Object.values(store.getState().vaults.byId)) {
    if (v.scriptHex === '') continue
    const credits = summariseCredits(await lookup(await vaultScriptHash(v.scriptHex)))
    if (JSON.stringify(credits) !== JSON.stringify(v.credits ?? [])) bus.publish(makeEvent('overlay', 'vault_credits', { vaultId: v.vaultId, credits }))
  }
}
