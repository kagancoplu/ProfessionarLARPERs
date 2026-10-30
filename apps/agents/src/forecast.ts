/**
 * How much GPU the agent will need over the next 7 days, from its own usage
 * history (the last 14 days in its profile): mean ± stdev per day, then
 * 7 · mean (p50) and 7 · mean + 1.28 · σ · √7 (p90).
 *
 * What the agent already holds counts against the need: minutes prepaid at the
 * provider, credit tokens in its wallet and credits pledged to pools that have
 * not settled yet. The rest, in whole credits, is what it could buy.
 */

export interface Coverage {
  prepaidMinutes: number
  ownedCredits: number
  /** Credits in pledges that have not settled yet. */
  pledgedCredits: number
}

export interface Forecast {
  horizonDays: number
  dailyMeanMinutes: number
  dailyStdevMinutes: number
  /** p50 need over the horizon, in GPU minutes. */
  needMinutes: number
  /** p90 need over the horizon, in GPU minutes. */
  highMinutes: number
  coveredMinutes: number
  /** How many days the current coverage lasts at the mean rate. */
  daysCovered: number
  minutesPerCredit: number
  /** Whole credits still missing to cover the p50 need. */
  creditsNeeded: number
}

export function forecastNeed (dailyMinutes: number[], coverage: Coverage, minutesPerCredit = 1, horizonDays = 7): Forecast {
  const n = dailyMinutes.length
  const mean = n === 0 ? 0 : dailyMinutes.reduce((s, m) => s + m, 0) / n
  const variance = n < 2 ? 0 : dailyMinutes.reduce((s, m) => s + (m - mean) ** 2, 0) / (n - 1)
  const stdev = Math.sqrt(variance)
  const needMinutes = Math.round(mean * horizonDays)
  const highMinutes = Math.round(mean * horizonDays + 1.28 * stdev * Math.sqrt(horizonDays))
  const coveredMinutes = coverage.prepaidMinutes + (coverage.ownedCredits + coverage.pledgedCredits) * minutesPerCredit
  return {
    horizonDays,
    dailyMeanMinutes: Math.round(mean),
    dailyStdevMinutes: Math.round(stdev),
    needMinutes,
    highMinutes,
    coveredMinutes,
    daysCovered: mean === 0 ? Infinity : Number((coveredMinutes / mean).toFixed(1)),
    minutesPerCredit,
    creditsNeeded: Math.max(0, Math.ceil((needMinutes - coveredMinutes) / minutesPerCredit))
  }
}
