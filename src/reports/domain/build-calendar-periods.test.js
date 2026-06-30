import { describe, it, expect } from 'vitest'
import { buildCalendarPeriods } from './build-calendar-periods.js'

const submittedReport = (overrides = {}) => ({
  id: 'report-1',
  status: 'submitted',
  submissionNumber: 1,
  submittedAt: '2026-01-20T10:00:00.000Z',
  submittedBy: { name: 'Test User' },
  resubmissionRequired: null,
  ...overrides
})

const period = (report) => ({
  year: 2026,
  period: 1,
  startDate: '2026-01-01',
  endDate: '2026-01-31',
  dueDate: '2026-02-20',
  submissionNumber: report?.submissionNumber ?? 1,
  report
})

describe('buildCalendarPeriods', () => {
  it('keeps a single item with null status for a period with no report', () => {
    const futurePeriod = {
      year: 2999,
      period: 1,
      startDate: '2999-01-01',
      endDate: '2999-12-31',
      dueDate: '3000-02-20',
      submissionNumber: 1,
      report: null
    }

    expect(buildCalendarPeriods([futurePeriod])).toEqual([
      { ...futurePeriod, periodStatus: null }
    ])
  })

  it('keeps a single item for a submitted period that is not flagged', () => {
    const submitted = period(submittedReport())

    expect(buildCalendarPeriods([submitted])).toEqual([
      { ...submitted, periodStatus: 'submitted' }
    ])
  })

  it('emits a requires_resubmission skeleton for a flagged submitted period', () => {
    const flagged = period(
      submittedReport({
        resubmissionRequired: {
          uploadedAt: '2026-05-01T12:00:00.000Z',
          reason: 'closed_period_restated',
          summaryLogId: 'sl-2'
        }
      })
    )

    const result = buildCalendarPeriods([flagged])

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      periodStatus: 'submitted',
      submissionNumber: 1
    })
    expect(result[1]).toMatchObject({
      submissionNumber: 2,
      periodStatus: 'requires_resubmission',
      report: null,
      dueDate: '2026-02-20'
    })
  })
})
