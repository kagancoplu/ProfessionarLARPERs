/**
 * `npm run demo:k1`: K1 end to end in one command, offline (mock chain).
 *
 *   provider  mints H100 GPU-hour credits and opens a 40-credit pool
 *   agents    forecast their week, decide (AGENT_BRAIN=rules|llm), pledge
 *   coord.    locks in → every agent checks the whole settlement and signs
 *   chain     ONE transaction pays the provider and delivers every share
 *   agents    redeem credits and run their GPU jobs on them
 *   market    an agent lists credits it no longer needs; another one, short
 *             for a big job, buys them in one tx instead of paying retail
 *
 * Every transaction is real and verified; only the chain is simulated.
 * Logs: data/demo-k1/agents/<name>/{decisions,activity}.log
 */
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { dataDir } from '@agentcoop/core/node/env'
import { brainFromEnv } from '../llmBrain'
import { nextJobs } from '../workload'
import { startMockStack, type DemoAgent } from './harness'
import { note, step, summary } from './show'

const out = join(dataDir(), 'demo-k1')
rmSync(out, { recursive: true, force: true })
const brain = brainFromEnv()

step(`AgentCoop K1 demo · mock chain · brain: ${brain.name}`)
const stack = await startMockStack({ dataDir: out, brain })
try {
  step('1. The provider opens a pool')
  const pool = await stack.openPool({ credits: 40, priceSats: 1000, deadline: '+144', feeSats: 100, minCredits: 5, label: 'H100 block · 40 GPU-hours' })
  note(`poolId ${pool.poolId} · offer signed SIGHASH_SINGLE|ANYONECANPAY and registered with the coordinator`)

  step('2. Three agents come online (each on the coordinator\'s WS)')
  const agents: DemoAgent[] = []
  for (const name of ['finetune', 'eval', 'inference']) agents.push(await stack.agent(name))

  step('3. Each agent forecasts its week and decides')
  for (const a of agents) await a.procurement.considerPools()

  step('4. Lock-in: the coordinator plans, every agent verifies and signs, one settlement tx')
  const pledged = agents.filter(a => a.participant.busy)
  await Promise.all(pledged.map(async a => { await a.participant.until(() => a.participant.active?.status !== 'pending' && a.participant.active?.status !== 'signed', 120_000) }))

  step('5. The agents do their own work, paying with their credits')
  for (const a of agents) {
    for (const need of nextJobs(a.agent.profile, 2)) await a.procurement.runJob(need)
  }

  step('6. Market: credits an agent will not use go to one that needs them')
  const [finetune, evalAgent] = agents
  note('eval\'s owner pauses the nightly suite for the rest of the week → its forecast drops')
  evalAgent.agent.profile.history.dailyMinutes = new Array(14).fill(20)
  await evalAgent.procurement.considerListing()
  note('finetune has a big job coming and too few credits left')
  const owned = Number(await finetune.agent.ownedCredits())
  const prepaid = await finetune.agent.prepaidMinutes()
  // A job worth what it holds plus 5 more credits: exactly one listed lot short.
  await finetune.procurement.runJob({ kind: 'finetune', minutes: prepaid + (owned + 5) * 60 })
  await summary(agents, out)
} finally {
  await stack.close()
}
