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

  it('expands each period locally, inserting the skeleton immediately after its origin', () => {
    const flagged = {
      year: 2026,
      period: 1,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      dueDate: '2026-02-20',
      submissionNumber: 1,
      report: submittedReport({
        id: 'report-jan',
        resubmissionRequired: {
          uploadedAt: '2026-05-01T12:00:00.000Z',
          reason: 'closed_period_restated',
          summaryLogId: 'sl-2'
        }
      })
    }

    const submitted = {
      year: 2026,
      period: 2,
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      dueDate: '2026-03-20',
      submissionNumber: 1,
      report: submittedReport({ id: 'report-feb' })
    }

    const noReport = {
      year: 2999,
      period: 3,
      startDate: '2999-03-01',
      endDate: '2999-03-31',
      dueDate: '2999-04-20',
      submissionNumber: 1,
      report: null
    }

    const result = buildCalendarPeriods([flagged, submitted, noReport])

    expect(result).toEqual([
      { ...flagged, periodStatus: 'submitted' },
      {
        ...flagged,
        submissionNumber: 2,
        periodStatus: 'requires_resubmission',
        report: null
      },
      { ...submitted, periodStatus: 'submitted' },
      { ...noReport, periodStatus: null }
    ])
  })
})
