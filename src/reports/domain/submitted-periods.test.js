import { describe, expect, it } from 'vitest'
import { CADENCE } from './cadence.js'
import { REPORT_STATUS } from './report-status.js'
import {
  buildSubmittedPeriods,
  isDateInSubmittedPeriod
} from './submitted-periods.js'

/** @import {ReportStatus} from './report-status.js' */

/**
 * @param {ReportStatus} status
 * @param {string} id
 * @returns {import('#reports/repository/port.js').ReportSummary}
 */
const reportSummary = (status, id) => ({
  id,
  status,
  submissionNumber: 1,
  submittedAt:
    status === REPORT_STATUS.SUBMITTED ? '2026-04-10T00:00:00Z' : null,
  submittedBy: null
})

/**
 * @param {Partial<import('#reports/repository/port.js').ReportPerPeriod>} [overrides]
 * @returns {import('#reports/repository/port.js').ReportPerPeriod}
 */
const slot = (overrides = {}) => ({
  startDate: '2026-01-01',
  endDate: '2026-03-31',
  dueDate: '2026-04-20',
  current: null,
  previousSubmissions: [],
  ...overrides
})

const submittedSlot = () =>
  slot({ current: reportSummary(REPORT_STATUS.SUBMITTED, 'r1') })

const inProgressSlot = () =>
  slot({ current: reportSummary(REPORT_STATUS.IN_PROGRESS, 'r2') })

const resubmittedSlot = () =>
  slot({
    current: reportSummary(REPORT_STATUS.IN_PROGRESS, 'r4'),
    previousSubmissions: [reportSummary(REPORT_STATUS.SUBMITTED, 'r3')]
  })

/**
 * @param {number} year
 * @param {import('#reports/repository/port.js').PeriodicReport['reports']} reports
 * @returns {import('#reports/repository/port.js').PeriodicReport}
 */
const periodicReport = (year, reports) => ({
  organisationId: 'org-1',
  registrationId: 'reg-1',
  year,
  reports
})

describe('buildSubmittedPeriods', () => {
  it('includes a period whose current report is submitted', () => {
    const reports = [
      periodicReport(2026, { quarterly: { 1: submittedSlot() } })
    ]

    const result = buildSubmittedPeriods(reports, CADENCE.quarterly)

    expect(result.has('2026:1')).toBe(true)
  })

  it('includes a period with previous submissions even if the current report is not submitted', () => {
    const reports = [
      periodicReport(2026, { quarterly: { 2: resubmittedSlot() } })
    ]

    const result = buildSubmittedPeriods(reports, CADENCE.quarterly)

    expect(result.has('2026:2')).toBe(true)
  })

  it('excludes a period that has never been submitted', () => {
    const reports = [
      periodicReport(2026, { quarterly: { 3: inProgressSlot() } })
    ]

    const result = buildSubmittedPeriods(reports, CADENCE.quarterly)

    expect(result.has('2026:3')).toBe(false)
  })

  it('skips a periodic report with no slots for the cadence', () => {
    const reports = [periodicReport(2026, { monthly: { 1: submittedSlot() } })]

    const result = buildSubmittedPeriods(reports, CADENCE.quarterly)

    expect(result.size).toBe(0)
  })

  it('keys submitted periods by year across multiple years', () => {
    const reports = [
      periodicReport(2025, { quarterly: { 4: submittedSlot() } }),
      periodicReport(2026, { quarterly: { 1: submittedSlot() } })
    ]

    const result = buildSubmittedPeriods(reports, CADENCE.quarterly)

    expect(result.has('2025:4')).toBe(true)
    expect(result.has('2026:1')).toBe(true)
  })
})

describe('isDateInSubmittedPeriod', () => {
  const reports = [periodicReport(2026, { quarterly: { 1: submittedSlot() } })]
  const submitted = buildSubmittedPeriods(reports, CADENCE.quarterly)

  it('returns true for a date in a submitted period', () => {
    expect(
      isDateInSubmittedPeriod(submitted, '2026-02-10', CADENCE.quarterly)
    ).toBe(true)
  })

  it('returns false for a date in an open period', () => {
    expect(
      isDateInSubmittedPeriod(submitted, '2026-05-10', CADENCE.quarterly)
    ).toBe(false)
  })
})
