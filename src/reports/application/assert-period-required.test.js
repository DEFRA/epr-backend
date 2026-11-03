import { describe, expect, it } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'
import { generateAllPeriodsForYear } from '#reports/domain/generate-reporting-periods.js'
import { partialMock } from '#test/type-helpers.js'
import { assertPeriodRequired } from './assert-period-required.js'

/**
 * @import { PeriodicReport } from '#reports/repository/port.js'
 */

const firstTwoQuarters = generateAllPeriodsForYear(
  'quarterly',
  toYear(2026)
).slice(0, 2)

/** @type {PeriodicReport[]} */
const quarterThreeOf2025Submitted = [
  partialMock({
    year: toYear(2025),
    reports: {
      quarterly: {
        3: partialMock({
          current: partialMock({ id: 'report-1', submissionNumber: 1 }),
          previousSubmissions: []
        })
      }
    }
  })
]

describe('assertPeriodRequired', () => {
  it('passes for a period the registration owes', () => {
    expect(() =>
      assertPeriodRequired([], firstTwoQuarters, toYear(2026), 'quarterly', 2)
    ).not.toThrow()
  })

  it('passes for a period the registration does not owe but has a stored submission for', () => {
    expect(() =>
      assertPeriodRequired(
        quarterThreeOf2025Submitted,
        firstTwoQuarters,
        toYear(2025),
        'quarterly',
        3
      )
    ).not.toThrow()
  })

  it('throws 404 period_not_required for a period the registration does not owe', () => {
    expect(() =>
      assertPeriodRequired([], firstTwoQuarters, toYear(2025), 'quarterly', 3)
    ).toThrow(
      expect.objectContaining({
        isBoom: true,
        message: 'No report is required for quarterly period 3 of 2025',
        output: expect.objectContaining({ statusCode: 404 }),
        code: 'period_not_required',
        event: {
          action: 'check_report_period',
          reason: 'cadence=quarterly period=3 year=2025'
        }
      })
    )
  })
})
