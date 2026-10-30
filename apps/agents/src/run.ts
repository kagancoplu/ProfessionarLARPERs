/**
 * `npm run agent -- <profile> [--jobs N] [--interval-ms M]`: run one agent.
 *
 * The agent works through its own workload (agents/<profile>.json) and pays
 * for each GPU job: prepaid credits when it has them, otherwise retail (402).
 * Faz 2 adds the forecast, the procurement router and pool pledges.
 *
 * Env: the profile's wallet key (e.g. WALLET_AGENT_2_KEY), PROVIDER_API_URL,
 * OVERLAY_URL, NETWORK, ARCADE_URL, DATA_DIR.
 */
import { parseArgs } from 'node:util'
import { COOP_SERVICE, COOP_TOPIC, OverlayClient } from '@agentcoop/core'
import { loadDotEnv, network } from '@agentcoop/core/node/env'
import { Agent } from './agent'
import { loadProfile } from './profile'
import { nextJobs } from './workload'

loadDotEnv()

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    jobs: { type: 'string', default: '3' },
    'interval-ms': { type: 'string', default: '2000' }
  }
})
const name = positionals[0]
if (name === undefined) {
  console.log('usage: agent <finetune|eval|inference|path/to/profile.json> [--jobs N] [--interval-ms M]')
  process.exit(1)
}

const profile = loadProfile(name)
const overlay = new OverlayClient(process.env.OVERLAY_URL ?? 'http://localhost:8080', undefined, network(), process.env.ARCADE_URL, COOP_TOPIC, COOP_SERVICE)
const { agent, close } = await Agent.open(profile, { overlay })
try {
  agent.log.info(`${profile.name} agent up (identity ${(await agent.identityKey()).slice(0, 16)}…): ${profile.description}`)
  const jobs = nextJobs(profile, Number(values.jobs))
  for (const [i, need] of jobs.entries()) {
    try {
      await agent.runJob(need)
    } catch (e) {
      agent.log.info(`Job failed: ${(e as Error).message}`)
    }
    if (i < jobs.length - 1) await new Promise(resolve => setTimeout(resolve, Number(values['interval-ms'])))
  }
} finally {
  await close()
}
