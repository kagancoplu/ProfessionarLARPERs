/**
 * Read-only diagnosis of an agent's pool check (Track C's Procurement.considerPools), step by step:
 * which condition stops it, and what its brain would decide. Sends nothing, pledges nothing.
 *
 *   npx tsx --import @agentcoop/core/register-sdk scripts/diag-agent-pools.ts [finetune|eval|inference]
 *
 * Uses the same wallet, catalog and coordinator as `npm run agents` (DATA_DIR, COOP_API_URL, PROVIDER_API_URL).
 */
import { COOP_SERVICE, COOP_TOPIC, OverlayClient } from '@agentcoop/core'
import { loadDotEnv, network } from '@agentcoop/core/node/env'
import { Agent } from '../apps/agents/src/agent'
import { describe, enforcePolicy } from '../apps/agents/src/brain'
import { brainFromEnv } from '../apps/agents/src/llmBrain'
import { Procurement } from '../apps/agents/src/procurement'
import { loadProfile } from '../apps/agents/src/profile'

loadDotEnv()
const name = process.argv[2] ?? 'finetune'
const coopApiUrl = process.env.COOP_API_URL ?? 'http://localhost:8090'
console.log(`agent ${name} · COOP_API_URL=${JSON.stringify(process.env.COOP_API_URL)} → ${coopApiUrl} · DATA_DIR=${JSON.stringify(process.env.DATA_DIR)}`)

const profile = loadProfile(name)
const overlay = new OverlayClient(process.env.OVERLAY_URL ?? 'http://localhost:8080', undefined, network(), process.env.ARCADE_URL, COOP_TOPIC, COOP_SERVICE)
const { agent, close } = await Agent.open(profile, { overlay })
try {
  const product = await agent.product()
  console.log(`1 product ${profile.product}: tokenId ${String(product.tokenId)}, retail ${product.retailSatsPerCredit} sat/credit, minutesPerCredit ${String(product.minutesPerCredit)}`)
  console.log(`  sats balance ${await agent.satsBalance()} · owned credits ${String(await agent.ownedCredits())} · spent this week ${agent.spentThisWeekSats()} / budget ${JSON.stringify(profile.budget)}`)
  const brain = brainFromEnv()
  const proc = new Procurement({ agent, brain, coopApiUrl } as any)
  const pools = await proc.openPools()
  console.log(`2 coordinator /pools: ${pools.length}`)
  for (const p of pools) {
    const checks = { open: p.status === 'open', hasOffer: p.hasOffer, sameToken: p.terms.tokenId === product.tokenId }
    console.log(`  ${p.poolId.slice(0, 12)} status=${p.status} hasOffer=${String(p.hasOffer)} token=${p.terms.tokenId.slice(0, 12)} pledged=${p.pledgedCredits}/${p.terms.credits} → ${JSON.stringify(checks)}`)
    if (!checks.open || !checks.hasOffer || !checks.sameToken) continue
    const ctx = await (proc as any).context(p)
    console.log('3 what the brain sees:')
    for (const line of describe(ctx)) console.log(`    ${line}`)
    const raw = await brain.decide(ctx)
    const d = enforcePolicy(ctx, raw)
    console.log(`4 brain (${brain.name}): ${JSON.stringify(raw)}`)
    console.log(`  after policy: ${JSON.stringify(d)}`)
  }
} finally {
  await close()
}
