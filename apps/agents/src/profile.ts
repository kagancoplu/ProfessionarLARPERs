/**
 * Agent workload profiles (`agents/*.json`): what the agent's real job
 * consumes (GPU minutes per day), its recent usage history, and the owner's
 * budget. The procurement brain (Faz 2) reads the same file.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const PROFILES_DIR = fileURLToPath(new URL('../agents/', import.meta.url))

export type JobKind = 'finetune' | 'eval' | 'inference'

export interface AgentProfile {
  name: string
  description: string
  /** Env variable holding the agent's wallet root key (64 hex). */
  walletEnv: string
  /** Provider product the agent buys (e.g. gpu-h100). */
  product: string
  /** 'p2pkh' = plain wallet-toolbox wallet; 'vault' = Mandate Vault + guard (Faz 3). */
  mode: 'p2pkh' | 'vault'
  workload: {
    kind: JobKind
    /** Average jobs per active day (fractions = not every day). */
    jobsPerDay: number
    /** Inclusive range of GPU minutes per job. */
    minutesPerJob: [number, number]
    /** Days the agent works, 0 = Sunday … 6 = Saturday. */
    activeWeekdays: number[]
  }
  history: {
    /** GPU minutes used per day, oldest first (the last 14 days). */
    dailyMinutes: number[]
  }
  budget: {
    weeklyBudgetSats: number
    maxPerPoolSats: number
    /** Allowed provider identity keys; empty = any. */
    allowProviders: string[]
  }
}

export function parseProfile (value: unknown, source = 'profile'): AgentProfile {
  const p = value as AgentProfile
  const fail = (why: string): never => { throw new Error(`${source}: ${why}`) }
  if (p === null || typeof p !== 'object') fail('not an object')
  if (typeof p.name !== 'string' || !/^[a-z0-9-]+$/.test(p.name)) fail('name must be lowercase letters, digits and dashes')
  if (typeof p.walletEnv !== 'string') fail('walletEnv is required')
  if (typeof p.product !== 'string') fail('product is required')
  if (p.mode !== 'p2pkh' && p.mode !== 'vault') fail("mode must be 'p2pkh' or 'vault'")
  const w = p.workload
  if (!['finetune', 'eval', 'inference'].includes(w?.kind)) fail('workload.kind must be finetune, eval or inference')
  if (!(w.jobsPerDay > 0)) fail('workload.jobsPerDay must be > 0')
  const [lo, hi] = w.minutesPerJob ?? []
  if (!Number.isSafeInteger(lo) || !Number.isSafeInteger(hi) || lo < 1 || hi < lo) fail('workload.minutesPerJob must be [min, max] integers')
  if (!Array.isArray(w.activeWeekdays) || w.activeWeekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) fail('workload.activeWeekdays must be 0..6')
  if (!Array.isArray(p.history?.dailyMinutes) || p.history.dailyMinutes.some(m => !(m >= 0))) fail('history.dailyMinutes must be non-negative numbers')
  const b = p.budget
  if (!Number.isSafeInteger(b?.weeklyBudgetSats) || !Number.isSafeInteger(b.maxPerPoolSats) || !Array.isArray(b.allowProviders)) fail('budget is incomplete')
  return p
}

export function loadProfile (nameOrPath: string): AgentProfile {
  const file = nameOrPath.endsWith('.json') ? nameOrPath : `${PROFILES_DIR}${nameOrPath}.json`
  return parseProfile(JSON.parse(readFileSync(file, 'utf8')), file)
}
