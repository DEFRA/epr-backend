import { describe, it, expect } from 'vitest'
import { buildAllSubmissionPeriods } from './build-all-submission-periods.js'

const submittedReport = (overrides = {}) => ({
  id: 'report-1',
  status: 'submitted',
  submissionNumber: 1,
  submittedAt: '2026-01-20T10:00:00.000Z',
  submittedBy: { name: 'Test User' },
  resubmissionRequired: null,
  ...overrides
})

const resubmissionFlag = {
  uploadedAt: '2026-05-01T12:00:00.000Z',
  reason: 'closed_period_restated',
  summaryLogId: 'sl-2'
}

const period = (report, overrides = {}) => ({
  year: 2026,
  period: 1,
  startDate: '2026-01-01',
  endDate: '2026-01-31',
  dueDate: '2026-02-20',
  submissionNumber: report?.submissionNumber ?? 1,
  report,
  previousSubmissions: [],
  ...overrides
})

describe('buildAllSubmissionPeriods', () => {
  it('emits every submission for a period, superseded ones as submitted, ordered ascending', () => {
    const current = submittedReport({ id: 'report-2', submissionNumber: 2 })
    const superseded = submittedReport({ id: 'report-1', submissionNumber: 1 })
    const merged = period(current, {
      submissionNumber: 2,
      previousSubmissions: [superseded]
    })

    const result = buildAllSubmissionPeriods([merged])

    expect(result.map((item) => item.submissionNumber)).toEqual([1, 2])
    expect(result.map((item) => item.periodStatus)).toEqual([
      'submitted',
      'submitted'
    ])
    expect(result[0].report).toBe(superseded)
    expect(result[1].report).toBe(current)
  })

  it('preserves the requires_resubmission skeleton alongside historical submissions', () => {
    const draft = submittedReport({
      id: 'report-3',
      status: 'in_progress',
      submissionNumber: 3,
      submittedAt: null,
      submittedBy: null
    })
    const flagged = submittedReport({
      id: 'report-2',
      submissionNumber: 2,
      resubmissionRequired: resubmissionFlag
    })
    const superseded = submittedReport({ id: 'report-1', submissionNumber: 1 })
    const merged = period(draft, {
      submissionNumber: 3,
      previousSubmissions: [flagged, superseded]
    })

    const result = buildAllSubmissionPeriods([merged])

    expect(result.map((item) => item.submissionNumber)).toEqual([1, 2, 3])
    expect(result.map((item) => item.periodStatus)).toEqual([
      'submitted',
      'submitted',
      'requires_resubmission'
    ])
    expect(result[2].report).toBe(draft)
  })

  it('does not duplicate the flagged submitted report the skeleton derives from', () => {
    const flagged = submittedReport({ resubmissionRequired: resubmissionFlag })
    const merged = period(flagged, { previousSubmissions: [] })

    const result = buildAllSubmissionPeriods([merged])

    expect(result.map((item) => item.submissionNumber)).toEqual([1, 2])
    expect(result.map((item) => item.periodStatus)).toEqual([
      'submitted',
      'requires_resubmission'
    ])
    expect(result[1].report).toBeNull()
  })

  it('emits a single item for a period with only a current submission', () => {
    const merged = period(submittedReport(), { previousSubmissions: [] })

    const result = buildAllSubmissionPeriods([merged])

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      submissionNumber: 1,
      periodStatus: 'submitted'
    })
  })

  it('defaults a missing previousSubmissions array to no history', () => {
    const { previousSubmissions: _omitted, ...merged } =
      period(submittedReport())

    const result = buildAllSubmissionPeriods([merged])

    expect(result).toHaveLength(1)
    expect(result[0].submissionNumber).toBe(1)
  })

  it('expands each period independently', () => {
    const jan = period(submittedReport({ id: 'jan-2', submissionNumber: 2 }), {
      submissionNumber: 2,
      previousSubmissions: [
        submittedReport({ id: 'jan-1', submissionNumber: 1 })
      ]
    })
    const feb = period(submittedReport({ id: 'feb-1' }), {
      period: 2,
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      dueDate: '2026-03-20',
      previousSubmissions: []
    })

    const result = buildAllSubmissionPeriods([jan, feb])

    expect(
      result.filter((item) => item.period === 1).map((i) => i.submissionNumber)
    ).toEqual([1, 2])
    expect(
      result.filter((item) => item.period === 2).map((i) => i.submissionNumber)
    ).toEqual([1])
  })
})
