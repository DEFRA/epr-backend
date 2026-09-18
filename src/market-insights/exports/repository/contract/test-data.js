const FIVE_MINUTES_MS = 5 * 60_000

export const JUNE_2026 = Object.freeze({
  year: 2026,
  cadence: 'monthly',
  period: 6
})

/**
 * A claim as a request for that period at that moment would make it: a build
 * still running is joined, anything else is built again.
 *
 * @param {import('../port.js').MarketInsightsExportsRepository} repository
 * @param {Date} now
 * @param {{ year: number, cadence: string, period: number }} [periodRef]
 */
export const claimAt = (repository, now, periodRef = JUNE_2026) =>
  repository.claimForBuild({
    ...periodRef,
    now,
    abandonedBefore: new Date(now.getTime() - FIVE_MINUTES_MS).toISOString()
  })
