import { describe, expect, it } from 'vitest'

import { PERIOD_STATUS } from '#reports/domain/period-status.js'
import { reportsCalendarResponseSchema } from './response.schema.js'

const validReport = {
  id: 'report-1',
  status: 'in_progress',
  submissionNumber: 1,
  submittedAt: null,
  submittedBy: null
}

const validItem = {
  year: 2026,
  period: 1,
  startDate: '2026-01-01',
  endDate: '2026-01-31',
  dueDate: '2026-02-20',
  submissionNumber: 1,
  periodStatus: PERIOD_STATUS.DUE,
  report: null
}

const validResponse = {
  cadence: 'monthly',
  reportingPeriods: [
    validItem,
    { ...validItem, period: 2, report: validReport }
  ]
}

describe('reportsCalendarResponseSchema', () => {
  it('accepts a well-formed calendar response', () => {
    const { error } = reportsCalendarResponseSchema.validate(validResponse)

    expect(error).toBeUndefined()
  })

  it.each(Object.values(PERIOD_STATUS))(
    'accepts periodStatus "%s"',
    (periodStatus) => {
      const response = {
        cadence: 'monthly',
        reportingPeriods: [{ ...validItem, periodStatus }]
      }

      const { error } = reportsCalendarResponseSchema.validate(response)

      expect(error).toBeUndefined()
    }
  )

  it('rejects a null periodStatus', () => {
    const response = {
      cadence: 'monthly',
      reportingPeriods: [{ ...validItem, periodStatus: null }]
    }

    const { error } = reportsCalendarResponseSchema.validate(response)

    expect(error).toBeDefined()
  })

  it('rejects a missing periodStatus', () => {
    const { periodStatus: _, ...itemWithoutStatus } = validItem
    const response = {
      cadence: 'monthly',
      reportingPeriods: [itemWithoutStatus]
    }

    const { error } = reportsCalendarResponseSchema.validate(response)

    expect(error).toBeDefined()
  })

  it('rejects an unknown periodStatus value', () => {
    const response = {
      cadence: 'monthly',
      reportingPeriods: [{ ...validItem, periodStatus: 'archived' }]
    }

    const { error } = reportsCalendarResponseSchema.validate(response)

    expect(error).toBeDefined()
  })
})
