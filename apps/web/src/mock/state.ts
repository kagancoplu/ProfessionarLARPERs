/** Mutable world of the mock mode: what the MSW handlers answer and what the scenario mutates. */
import type { AgentInfo, ApiPool, Catalog, GuardDecision, GuardPolicy, Listing, PledgeView, ProviderJob, VaultView } from '../api/types'
import { MOCK_AGENTS, MOCK_IDS, MOCK_PRODUCT, MOCK_VAULT_ID } from './data'

export interface MockWorld {
  height: number
  pools: Map<string, ApiPool>
  pledges: Map<string, PledgeView[]>
  listings: Map<string, Listing>
  vaults: Map<string, VaultView>
  policies: Map<string, { owner: string, policy: GuardPolicy, updatedAt: string }>
  decisions: GuardDecision[]
  agents: AgentInfo[]
  catalog: Catalog
  /** the human at the keyboard (mock Desktop): what the flows did */
  me: {
    pledges: Map<string, { outpoint: string, credits: number, signed: boolean }>
    credits: bigint
    prepaidMinutes: number
    jobs: Map<string, ProviderJob>
    minted?: { sym: string, amt: bigint, tokenId: string }
    pools: Set<string>
    revenue: number[]
    revenueSynced: Array<{ poolId: string, sats: number }>
    waitingSince?: number
    /** listings I posted (outpoints) */
    listings: Set<string>
  }
}

export function createMockWorld (height = 920_000): MockWorld {
  const vault: VaultView = {
    vaultId: MOCK_VAULT_ID, owner: MOCK_IDS.owner, agent: MOCK_IDS.agents.finetune, guard: MOCK_IDS.guard,
    scriptHex: '63' + '21' + MOCK_IDS.owner + 'ac67' + '5221' + MOCK_IDS.agents.finetune + '21' + MOCK_IDS.guard + '52ae68',
    verified: true, balanceSats: 40_000, utxos: [{ outpoint: 'mock_vault_fund_001_0', satoshis: 40_000 }]
  }
  return {
    height,
    pools: new Map(),
    pledges: new Map(),
    listings: new Map(),
    vaults: new Map([[vault.vaultId, vault]]),
    policies: new Map([[MOCK_IDS.agents.finetune, {
      owner: MOCK_IDS.owner, updatedAt: new Date().toISOString(),
      policy: { allowProviders: [MOCK_IDS.provider], maxPerPoolSats: 5_000, weeklyCapSats: 30_000, maxFeeSats: 200, hotWalletDailySats: 2_000 }
    }]]),
    decisions: [],
    agents: MOCK_AGENTS.map(a => ({ ...a })),
    me: { pledges: new Map(), credits: 0n, prepaidMinutes: 0, jobs: new Map(), pools: new Set(), revenue: [], revenueSynced: [], listings: new Set() },
    catalog: {
      provider: { name: 'AgentCoop simulated GPU provider (mock)', server: MOCK_IDS.providerServer },
      products: [{ ...MOCK_PRODUCT }],
      jobKinds: ['finetune', 'eval', 'inference'],
      maxJobMinutes: 1440,
      credits: { maxRedeem: 20, maxPending: 20, redeemTo: MOCK_IDS.providerServer },
      pools: [],
      poolsSource: 'mock'
    }
  }
}
