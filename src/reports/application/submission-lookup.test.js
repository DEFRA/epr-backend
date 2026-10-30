import { describe, expect, it } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'
import { partialMock } from '#test/type-helpers.js'
import { hasStoredSubmission } from './submission-lookup.js'

/**
 * @import { PeriodicReport, ReportPerPeriod, ReportSummary } from '#reports/repository/port.js'
 */

const YEAR = toYear(2026)

/**
 * @param {Pick<ReportPerPeriod, 'current' | 'previousSubmissions'>} slot
 * @returns {PeriodicReport[]}
 */
const withQuarterOne = (slot) => [
  partialMock({
    year: YEAR,
    reports: {
      quarterly: { 1: partialMock({ ...slot }) }
    }
  })
]

/** @type {ReportSummary} */
const submission = partialMock({ id: 'report-1', submissionNumber: 1 })

describe('hasStoredSubmission', () => {
  it.each([
    ['no slot for the period', [], false],
    [
      'a slot left empty',
      withQuarterOne({ current: null, previousSubmissions: [] }),
      false
    ],
    [
      'a current submission',
      withQuarterOne({ current: submission, previousSubmissions: [] }),
      true
    ],
    [
      'only a previous submission',
      withQuarterOne({ current: null, previousSubmissions: [submission] }),
      true
    ]
  ])('given %s, returns %s', (_, periodicReports, expected) => {
    expect(hasStoredSubmission(periodicReports, YEAR, 'quarterly', 1)).toBe(
      expected
    )
  })
})
