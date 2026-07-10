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

const period = (report, overrides = {}) => ({
  year: 2026,
  period: 1,
  startDate: '2026-01-01',
  endDate: '2026-01-31',
  dueDate: '2026-02-20',
  submissionNumber: report?.submissionNumber ?? 1,
  report,
  // feed-only projection; this builder strips it, so its value is irrelevant here
  submittedReports: [],
  ...overrides
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
    const flagged = period(
      submittedReport({
        id: 'report-jan',
        resubmissionRequired: {
          uploadedAt: '2026-05-01T12:00:00.000Z',
          reason: 'closed_period_restated',
          summaryLogId: 'sl-2'
        }
      })
    )

    const submitted = period(submittedReport({ id: 'report-feb' }), {
      period: 2,
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      dueDate: '2026-03-20'
    })

    const noReport = period(null, {
      year: 2999,
      period: 3,
      startDate: '2999-03-01',
      endDate: '2999-03-31',
      dueDate: '2999-04-20'
    })

    const result = buildCalendarPeriods([flagged, submitted, noReport])

    // The builder drops the feed-only submittedReports, so the expected items do too
    const item = ({ submittedReports: _submittedReports, ...rest }) => rest

    expect(result).toEqual([
      { ...item(flagged), periodStatus: 'submitted' },
      {
        ...item(flagged),
        submissionNumber: 2,
        periodStatus: 'requires_resubmission',
        report: null
      },
      { ...item(submitted), periodStatus: 'submitted' },
      { ...item(noReport), periodStatus: null }
    ])
  })
})
