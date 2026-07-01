import { afterEach, describe, it, expect } from 'vitest'
import { config } from '#root/config.js'
import { gateClosedPeriods } from './classify-and-persist.js'

/** @import { LoadsByReportingPeriod } from './period-status.js' */

const CLOSED_PERIOD_ADJUSTMENTS = 'featureFlags.closedPeriodAdjustments'

describe('gateClosedPeriods', () => {
  const loadsByReportingPeriod = /** @type {LoadsByReportingPeriod} */ (
    /** @type {unknown} */ ({
      openPeriodLoads: {},
      closedPeriodLoads: {},
      closedPeriods: [{ year: 2026, cadence: 'monthly', period: 1 }]
    })
  )

  afterEach(() => {
    config.set(CLOSED_PERIOD_ADJUSTMENTS, false)
  })

  it('keeps closedPeriods when the feature is enabled', () => {
    config.set(CLOSED_PERIOD_ADJUSTMENTS, true)

    const result = gateClosedPeriods(loadsByReportingPeriod)

    expect(result).toBe(loadsByReportingPeriod)
  })

  it('clears closedPeriods to an empty array when the feature is disabled', () => {
    const result = gateClosedPeriods(loadsByReportingPeriod)

    expect(result).toEqual({ ...loadsByReportingPeriod, closedPeriods: [] })
  })

  it('returns null when there is no loadsByReportingPeriod', () => {
    const result = gateClosedPeriods(null)

    expect(result).toBeNull()
  })
})
