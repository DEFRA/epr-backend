import { describe, expect, it } from 'vitest'
import { calendarDate } from '#common/helpers/date-formatter.js'
import { CADENCE } from './cadence.js'
import { findPeriodSlot } from './find-period-slot.js'

/** @import {PeriodicReport, ReportPerPeriod} from '#reports/repository/port.js' */

/** @type {ReportPerPeriod} */
const q1Slot = {
  startDate: calendarDate('2026-01-01'),
  endDate: calendarDate('2026-03-31'),
  dueDate: calendarDate('2026-04-20'),
  current: null,
  previousSubmissions: []
}

/** @type {PeriodicReport[]} */
const periodicReports = [
  {
    organisationId: 'org-1',
    registrationId: 'reg-1',
    year: 2026,
    reports: { [CADENCE.quarterly]: { 1: q1Slot } }
  }
]

describe('findPeriodSlot', () => {
  it('returns the slot for the period', () => {
    expect(
      findPeriodSlot(periodicReports, {
        year: 2026,
        cadence: CADENCE.quarterly,
        period: 1
      })
    ).toBe(q1Slot)
  })

  it.each([
    ['year', { year: 2025, cadence: CADENCE.quarterly, period: 1 }],
    ['cadence', { year: 2026, cadence: CADENCE.monthly, period: 1 }],
    ['period', { year: 2026, cadence: CADENCE.quarterly, period: 2 }]
  ])('returns null when the %s has no reports', (_, period) => {
    expect(findPeriodSlot(periodicReports, period)).toBeNull()
  })
})
