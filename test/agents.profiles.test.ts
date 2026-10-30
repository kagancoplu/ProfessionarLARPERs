/** Track C Faz 0: agent workload profiles load and drive a reproducible workload. */
import { describe, expect, it } from 'vitest'
import { loadProfile, parseProfile } from '../apps/agents/src/profile'
import { jobsForDay, nextJobs } from '../apps/agents/src/workload'

describe('agent profiles', () => {
  it('loads the three workload profiles', () => {
    const [ft, ev, inf] = ['finetune', 'eval', 'inference'].map(loadProfile)
    expect(ft.workload).toMatchObject({ kind: 'finetune', minutesPerJob: [240, 480] })
    expect(ev.workload.activeWeekdays).toEqual([1, 2, 3, 4, 5])
    expect(inf.workload.jobsPerDay).toBe(24)
    for (const p of [ft, ev, inf]) expect(p.history.dailyMinutes).toHaveLength(14)
    expect(new Set([ft, ev, inf].map(p => p.walletEnv)).size).toBe(3)
  })

  it('rejects a broken profile', () => {
    const ok = loadProfile('eval')
    expect(() => parseProfile({ ...ok, workload: { ...ok.workload, minutesPerJob: [30, 10] } })).toThrow(/minutesPerJob/)
  })
})

describe('workload', () => {
  const ev = loadProfile('eval')

  it('is reproducible and respects the profile', () => {
    const monday = '2026-11-02'
    expect(jobsForDay(ev, monday)).toEqual(jobsForDay(ev, monday))
    expect(jobsForDay(ev, monday)).toHaveLength(4)
    for (const j of jobsForDay(ev, monday)) expect(j.minutes).toBeGreaterThanOrEqual(15)
    expect(jobsForDay(ev, '2026-11-01')).toEqual([]) // Sunday: eval agent is idle
  })

  it('skips idle days when asked for the next jobs', () => {
    expect(nextJobs(ev, 6, '2026-10-31')).toHaveLength(6) // Saturday start
    expect(nextJobs(loadProfile('finetune'), 3, '2026-10-31').every(j => j.minutes >= 240)).toBe(true)
  })
})
