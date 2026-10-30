/**
 * `npm run demo:failed-pool`: a pool that does not fill costs nothing but the
 * registration fee, offline (mock chain).
 *
 *   1. the provider opens a 500-credit pool that closes in 6 blocks
 *   2. the finetune agent pledges 17; nobody else joins
 *   3. the deadline passes: the coordinator declares the pool failed,
 *      nothing is broadcast, the pledge coin is still in the agent's wallet
 *   4. a right-sized pool opens; the agent withdraws its coin, pledges again,
 *      and this pool settles
 */
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { PLEDGE_BASKET } from '@agentcoop/core'
import { dataDir } from '@agentcoop/core/node/env'
import { brainFromEnv } from '../llmBrain'
import { startMockStack } from './harness'
import { note, step, summary } from './show'

const out = join(dataDir(), 'demo-failed-pool')
rmSync(out, { recursive: true, force: true })
const brain = brainFromEnv()

step(`AgentCoop failed-pool demo · mock chain · brain: ${brain.name}`)
const stack = await startMockStack({ dataDir: out, brain })
try {
  step('1. The provider opens a big pool that closes in 6 blocks')
  await stack.openPool({ credits: 500, priceSats: 12_500, deadline: '+6', feeSats: 100, minCredits: 5, label: 'H100 rack · 500 GPU-hours' })
  const a = await stack.agent('finetune')

  step('2. The finetune agent decides and pledges; nobody else joins')
  await a.procurement.considerPools()
  const coin = a.participant.active?.outpoint

  step('3. Seven blocks later the deadline has passed')
  await stack.advanceBlocks(7)
  await a.participant.until(() => a.participant.active?.status === 'failed', 30_000)
  const coins = (await a.wallet.listOutputs({ basket: PLEDGE_BASKET, limit: 100 })).outputs.filter(o => o.spendable).map(o => o.outpoint)
  note(`pledge coin ${String(coin)} still unspent in the agent's wallet: ${coins.includes(String(coin).replace('_', '.')) ? 'yes' : 'NO'}`)

  step('4. A right-sized pool opens; the agent reuses its coin')
  await stack.openPool({ credits: 17, priceSats: 425, deadline: '+144', feeSats: 100, minCredits: 5, label: 'H100 block · 17 GPU-hours' })
  await a.procurement.considerPools()
  await a.participant.until(() => a.participant.active?.status === 'settled', 120_000)
  await summary([a], out)
} finally {
  await stack.close()
}
