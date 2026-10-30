/**
 * Mainnet finding (30.10): agents on the coordinator's WS never decided on an
 * open pool and wrote nothing to decisions.log. A pool check that does not
 * decide now says why (once per reason), and an agent whose cached catalog
 * predates the provider's mint asks the provider again.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Catalog } from '../apps/agents/src/providerClient'
import { startMockStack, type MockStack } from '../apps/agents/src/demo/harness'

describe('a pool check that does not decide explains itself', () => {
  let stack: MockStack

  beforeAll(async () => { stack = await startMockStack({ quiet: true }) })
  afterAll(async () => { await stack?.close() })

  it('says once that there is no pool to decide on', async () => {
    const a = await stack.agent('eval')
    expect(await a.procurement.considerPools()).toBeUndefined()
    expect(await a.procurement.considerPools()).toBeUndefined()
    expect(a.agent.log.lines.filter(l => l.includes('Pool check: no pools at the coordinator.'))).toHaveLength(1)
  })

  it('refreshes a catalog cached before the token was minted, then decides', async () => {
    const a = await stack.agent('finetune')
    const real = await a.agent.catalog()
    // What an agent started before `provider-cli mint` (or before provider-api reloaded the product) holds.
    const stale: Catalog = { ...real, products: real.products.map(p => ({ ...p, tokenId: null })) }
    ;(a.agent as unknown as { cachedCatalog: Catalog }).cachedCatalog = stale
    await stack.openPool({ credits: 40, priceSats: 1000, deadline: '+144', feeSats: 100, minCredits: 5, label: 'H100 block · 40 GPU-hours' })
    expect(await a.procurement.considerPools()).toMatchObject({ action: 'pledge', credits: 17 })
  })
})
