import { toYear } from '#common/helpers/dates/year.js'
import { describe, it, expect } from 'vitest'
import { calendarDate } from '#common/helpers/date-formatter.js'
import { buildCalendarPeriods } from './build-calendar-periods.js'

/** @import { MergedPeriod } from './merge-reporting-periods.js' */

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
  year: toYear(2026),
  period: 1,
  startDate: calendarDate('2026-01-01'),
  endDate: calendarDate('2026-01-31'),
  dueDate: calendarDate('2026-02-20'),
  submissionNumber: report?.submissionNumber ?? 1,
  report,
  ...overrides
})

describe('buildCalendarPeriods', () => {
  it('emits a requires_resubmission skeleton for a flagged submitted period', () => {
    const flagged = period(
      submittedReport({
        resubmissionRequired: {
          closedPeriodRestated: {
            uploadedAt: '2026-05-01T12:00:00.000Z',
            summaryLogId: 'sl-2'
          }
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
      dueDate: flagged.dueDate
    })
  })

  it('carries the in-flight resubmission draft on the requires_resubmission item', () => {
    const flagged = submittedReport({
      resubmissionRequired: {
        closedPeriodRestated: {
          uploadedAt: '2026-05-01T12:00:00.000Z',
          summaryLogId: 'sl-2'
        }
      }
    })
    const draft = submittedReport({
      id: 'report-2',
      status: 'in_progress',
      submissionNumber: 2,
      submittedAt: null,
      submittedBy: null
    })

    const result = buildCalendarPeriods([
      /** @type {MergedPeriod} */ (
        /** @type {unknown} */ ({
          ...period(draft),
          previousSubmissions: [flagged]
        })
      )
    ])

    expect(result[1]).toMatchObject({
      submissionNumber: 2,
      periodStatus: 'requires_resubmission',
      report: draft
    })
  })

  it('expands each period locally, inserting the skeleton immediately after its origin', () => {
    const flagged = period(
      submittedReport({
        id: 'report-jan',
        resubmissionRequired: {
          closedPeriodRestated: {
            uploadedAt: '2026-05-01T12:00:00.000Z',
            summaryLogId: 'sl-2'
          }
        }
      })
    )

    const submitted = period(submittedReport({ id: 'report-feb' }), {
      period: 2,
      startDate: calendarDate('2026-02-01'),
      endDate: calendarDate('2026-02-28'),
      dueDate: calendarDate('2026-03-20')
    })

    const noReport = period(null, {
      year: 2999,
      period: 3,
      startDate: calendarDate('2999-03-01'),
      endDate: calendarDate('2999-03-31'),
      dueDate: calendarDate('2999-04-20')
    })

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
