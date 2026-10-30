/** Fixed identities and the one product used by the mock scenario and MSW handlers. */
import type { ApiPool, PledgeView } from '../api/types'

/** deterministic fake compressed public keys (66 hex) — not real keys */
const fakeKey = (seed: string, prefix: '02' | '03' = '02'): string => {
  let h = 0x811c9dc5
  let out = ''
  for (let i = 0; out.length < 64; i++) {
    h ^= seed.charCodeAt(i % seed.length) + i
    h = Math.imul(h, 0x01000193) >>> 0
    out += h.toString(16).padStart(8, '0')
  }
  return prefix + out.slice(0, 64)
}

export const MOCK_IDS = {
  provider: fakeKey('provider-desktop', '03'),
  providerServer: fakeKey('provider-api'),
  guard: fakeKey('guard'),
  owner: fakeKey('owner-desktop', '03'),
  me: fakeKey('human-participant', '03'),
  agents: {
    finetune: fakeKey('agent-1-finetune'),
    eval: fakeKey('agent-2-eval'),
    inference: fakeKey('agent-3-inference')
  }
} as const

export const MOCK_TOKEN_ID = `${'a'.repeat(60)}1337_0`
export const MOCK_VAULT_ID = 'c0ffee00deadbeef0badf00d12345678'

export const MOCK_AGENTS = [
  { name: 'finetune', profile: 'finetune', identity: MOCK_IDS.agents.finetune, mode: 'vault' as const, vaultId: MOCK_VAULT_ID },
  { name: 'eval', profile: 'eval', identity: MOCK_IDS.agents.eval, mode: 'p2pkh' as const },
  { name: 'inference', profile: 'inference', identity: MOCK_IDS.agents.inference, mode: 'p2pkh' as const }
]

export const MOCK_PRODUCT = { id: 'gpu-h100', label: 'H100 GPU-hour', unit: 'GPU-hour', retailSatsPerCredit: 50, minutesPerCredit: 60, tokenId: MOCK_TOKEN_ID }

let txSeq = 0
/** `mock_` prefixed ids never get a WhatsOnChain link (track-E 0.5). */
export const mockTxid = (label: string): string => `mock_${label}_${(++txSeq).toString(36).padStart(3, '0')}`

export function makeMockPool (n: number, height: number, overrides: Partial<ApiPool['terms']> = {}): ApiPool {
  const txid = mockTxid(`pool${n}`)
  const poolId = `${txid}_0`
  const credits = overrides.credits ?? '1000'
  const priceSats = overrides.priceSats ?? '25000'
  return {
    poolId,
    txid,
    terms: {
      v: '1', poolId, provider: MOCK_IDS.provider, providerApi: 'http://localhost:8092', tokenId: MOCK_TOKEN_ID,
      credits, priceSats, payScriptHex: '76a914' + '11'.repeat(20) + '88ac', feeSats: '300', minCredits: '50',
      deadlineHeight: String(height + 60), label: `8×H100 · 1 week · pool ${n}`, retailSatsPerCredit: String(MOCK_PRODUCT.retailSatsPerCredit),
      ...overrides
    },
    status: 'open', pledgedCredits: '0', pledgeCount: 0, target: credits, createdHeight: height, hasOffer: true, height
  }
}

export function makeMockPledge (pool: ApiPool, participant: string, credits: string, height: number, signer: 'p2pkh' | 'vault' = 'p2pkh'): PledgeView {
  const txid = mockTxid('pledge')
  const unit = Number(pool.terms.priceSats) / Number(pool.terms.credits)
  return {
    outpoint: `${txid}_0`, txid, vout: 0, poolId: pool.poolId, participant, credits, tokenIndex: '0', signer,
    coinSats: Math.ceil(Number(credits) * unit) + 1, height, spent: false, valid: true
  }
}
