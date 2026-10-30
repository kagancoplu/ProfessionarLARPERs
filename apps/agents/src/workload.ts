/**
 * The agent's own work, simulated: which GPU jobs it needs to run, drawn from
 * its profile with a PRNG seeded by (agent name, day, slot) so a run is
 * reproducible.
 */
import { createHash } from 'node:crypto'
import type { AgentProfile, JobKind } from './profile'

export interface JobNeed {
  kind: JobKind
  minutes: number
}

function unit (seed: string): number {
  return Number.parseInt(createHash('sha256').update(seed).digest('hex').slice(0, 8), 16) / 0x1_0000_0000
}

/** Jobs the agent runs on `day` (YYYY-MM-DD). Empty on inactive days. */
export function jobsForDay (profile: AgentProfile, day: string): JobNeed[] {
  const w = profile.workload
  if (!w.activeWeekdays.includes(new Date(`${day}T00:00:00Z`).getUTCDay())) return []
  // jobsPerDay = 0.4 → one job on ~40% of days; 4 → four jobs every day.
  const whole = Math.floor(w.jobsPerDay)
  const count = whole + (unit(`${profile.name}|${day}|count`) < w.jobsPerDay - whole ? 1 : 0)
  const [lo, hi] = w.minutesPerJob
  return Array.from({ length: count }, (_, i) => ({
    kind: w.kind,
    minutes: lo + Math.floor(unit(`${profile.name}|${day}|${i}`) * (hi - lo + 1))
  }))
}

/** The next `n` jobs starting at `day`, skipping idle days (at most 60 days ahead). */
export function nextJobs (profile: AgentProfile, n: number, day = new Date().toISOString().slice(0, 10)): JobNeed[] {
  const out: JobNeed[] = []
  const d = new Date(`${day}T00:00:00Z`)
  for (let i = 0; i < 60 && out.length < n; i++) {
    out.push(...jobsForDay(profile, d.toISOString().slice(0, 10)))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out.slice(0, n)
}
