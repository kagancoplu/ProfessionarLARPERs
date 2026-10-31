/**
 * Run agents against real services (overlay, coordinator, provider-api):
 *
 *   npm run agents                        all three (finetune, eval, inference)
 *   npm run agent -- eval [--jobs N]      one agent
 *
 * Each agent stays on the coordinator's WS (so it can be asked to sign),
 * looks at open pools before each job (forecast → brain → policy → maybe
 * pledge), then runs its next GPU job on credits or at retail. With --jobs N
 * it stops after N jobs, waiting for a pending pledge to settle or fail
 * (--wait-ms); without it, it works until Ctrl+C.
 *
 * Live feed for the web app: GET {AGENTS_URL}/events (SSE), /agents, /healthz
 * (events.ts; AGENTS_URL default http://localhost:8093).
 *
 * Mandate Vault mode: set `<NAME>_VAULT_ID` (e.g. FINETUNE_VAULT_ID) to the vault
 * the owner created and funded with owner-cli (and the agent adopted); that
 * agent then pledges from the vault and every signature goes through the
 * guard at GUARD_URL.
 *
 * Env: WALLET_AGENT_1..3_KEY (per profile), PROVIDER_API_URL, OVERLAY_URL, GUARD_URL,
 * COOP_API_URL, AGENTS_URL, AGENTS_CORS_ORIGIN, AGENT_BRAIN=rules|llm
 * (llm: ANTHROPIC_API_KEY), NETWORK, ARCADE_URL, DATA_DIR.
 * Offline demo instead: npm run demo:k1.
 */
import { parseArgs } from 'node:util'
import { COOP_SERVICE, COOP_TOPIC, OverlayClient } from '@agentcoop/core'
import { loadDotEnv, network } from '@agentcoop/core/node/env'
import { httpCosigner } from '@agentcoop/core/signers/VaultSigner'
import { Agent } from './agent'
import { AgentEvents, startAgentsServer, type AgentInfo } from './events'
import { brainFromEnv } from './llmBrain'
import { Market } from './market'
import { PoolParticipant } from './participant'
import { Procurement } from './procurement'
import { loadProfile } from './profile'
import { jobsForDay } from './workload'

loadDotEnv()

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    jobs: { type: 'string' },
    'interval-ms': { type: 'string', default: '30000' },
    'wait-ms': { type: 'string', default: '600000' }
  }
})
const names = positionals.length > 0 ? positionals : ['finetune', 'eval', 'inference']
const maxJobs = values.jobs === undefined ? Infinity : Number(values.jobs)
const intervalMs = Number(values['interval-ms'])
const coopApiUrl = process.env.COOP_API_URL ?? 'http://localhost:8090'
const brain = brainFromEnv()
let stopping = false
const events = new AgentEvents()
const roster: AgentInfo[] = []
const feedUrl = new URL(process.env.AGENTS_URL ?? 'http://localhost:8093')
const feed = await startAgentsServer({ port: Number(feedUrl.port || 8093), events, agents: () => roster, corsOrigin: process.env.AGENTS_CORS_ORIGIN })
console.log(`agents live feed on ${feed.url}/events`)

/** The agent's own work, day after day from today. */
function * workload (profile: ReturnType<typeof loadProfile>): Generator<ReturnType<typeof jobsForDay>[number]> {
  const day = new Date()
  for (;;) {
    yield * jobsForDay(profile, day.toISOString().slice(0, 10))
    day.setUTCDate(day.getUTCDate() + 1)
  }
}

async function runAgent (name: string): Promise<void> {
  const profile = loadProfile(name)
  const overlay = new OverlayClient(process.env.OVERLAY_URL ?? 'http://localhost:8080', undefined, network(), process.env.ARCADE_URL, COOP_TOPIC, COOP_SERVICE)
  const vaultId = process.env[`${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_VAULT_ID`]
  if (vaultId !== undefined && vaultId !== '') profile.mode = 'vault'
  const guardCosign = profile.mode === 'vault' ? httpCosigner(process.env.GUARD_URL ?? 'http://localhost:8091') : undefined
  const { agent, close } = await Agent.open(profile, { overlay, events, vaultId: profile.mode === 'vault' ? vaultId : undefined, vaultCosign: guardCosign })
  if (profile.mode === 'vault' && (vaultId === undefined || vaultId === '')) throw new Error(`${name} is in vault mode: set ${name.toUpperCase()}_VAULT_ID (owner-cli create-vault / fund, then adopt)`)
  const identity = await agent.identityKey()
  roster.push({ name: profile.name, profile: profile.name, identity, mode: profile.mode, ...(agent.vaultId !== undefined ? { vaultId: agent.vaultId } : {}) })
  agent.emit('agent_started', { name: profile.name, profile: profile.name, identity })
  const vault = agent.vaultId !== undefined && guardCosign !== undefined ? { vaultId: agent.vaultId, cosign: guardCosign } : undefined
  const participant = new PoolParticipant({ wallet: agent.wallet, kit: agent.tokens!, coopApiUrl, log: agent.log, emit: (t, d, x) => { agent.emit(t, d, x) }, vault })
  try {
    agent.log.info(`${profile.name} agent up (identity ${(await agent.identityKey()).slice(0, 16)}…, brain ${brain.name}): ${profile.description}`)
    // A restarted agent takes its waiting pledge back from the wallet before the coordinator asks it to sign.
    await participant.restore().catch(e => { agent.log.info(`could not restore a pledge from the wallet: ${(e as Error).message}`) })
    try {
      await participant.connect()
    } catch (e) {
      agent.log.info(`coordinator ${coopApiUrl} unreachable (${(e as Error).message !== '' ? (e as Error).message : String((e as { code?: string }).code ?? e)}); credits and retail only until it is back`)
      participant.reconnectLater()
    }
    const market = new Market(agent, { coopApiUrl })
    const procurement = new Procurement({ agent, brain, participant, market, coopApiUrl })
    let done = 0
    for (const need of workload(profile)) {
      if (stopping || done >= maxJobs) break
      try {
        await procurement.tick(need)
      } catch (e) {
        agent.log.info(`Job failed: ${(e as Error).message}`)
      }
      done++
      if (done < maxJobs && !stopping) await new Promise(resolve => setTimeout(resolve, intervalMs))
    }
    if (participant.busy) {
      agent.log.info(`Waiting for "${participant.active!.label}" to settle or fail…`)
      await participant.until(() => !participant.busy, Number(values['wait-ms'])).catch(() => { agent.log.info('Still pending; the pledge coin stays in the wallet.') })
    }
  } finally {
    participant.close()
    await close()
  }
}

process.on('SIGINT', () => { stopping = true; console.log('\nstopping after the current job…') })
await Promise.all(names.map(runAgent))
await feed.close()
