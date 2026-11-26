import { toYear } from '#common/helpers/dates/year.js'
import { describe, expect, it } from 'vitest'
import {
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { periodicReportForYear } from './periodic-report-for-year.js'

/** @import {PeriodicReport} from '#reports/repository/port.js' */

/**
 * @param {number} year
 * @returns {PeriodicReport}
 */
const periodicReportIn = (year) => ({
  organisationNumber: toOrganisationNumber('500001'),
  registrationNumber: toRegistrationNumber('R25SR500010912PL'),
  year: toYear(year),
  reports: {}
})

describe('periodicReportForYear', () => {
  it('returns the periodic report for the year', () => {
    const report2026 = periodicReportIn(2026)

    expect(
      periodicReportForYear([periodicReportIn(2025), report2026], toYear(2026))
    ).toBe(report2026)
  })

  it('returns null when no periodic report is for the year', () => {
    expect(
      periodicReportForYear([periodicReportIn(2025)], toYear(2026))
    ).toBeNull()
  })
})
