import { describe, it, expect } from 'vitest'
import { buildAllSubmissionPeriods } from './build-all-submission-periods.js'

/**
 * Only the two cases the endpoint path cannot reach live here. Everything else
 * this builder does is exercised through the real submit flow in
 * `reports/routes/get.test.js` (the `?expand=submissions` view). These two
 * cannot be: `mergeReportingPeriods` always populates `previousSubmissions`, and
 * the submission-number invariant means the submit flow never produces a
 * non-submitted previous submission.
 */

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
  previousSubmissions: [],
  ...overrides
})

describe('buildAllSubmissionPeriods', () => {
  it('defaults a missing previousSubmissions array to no history', () => {
    const { previousSubmissions: _omitted, ...merged } =
      period(submittedReport())

    const result = buildAllSubmissionPeriods([merged])

    expect(result).toHaveLength(1)
    expect(result[0].submissionNumber).toBe(1)
  })

  it('excludes a non-submitted report from the submissions view', () => {
    // The invariant: submission number N > 1 is only created once N-1 is
    // submitted and flagged (assertResubmissionAllowed), so a report only drops
    // below the current slot after it has been submitted, i.e. a previous
    // submission is always submitted. This guards the defensive filter against a
    // future change to that precondition: a non-submitted report reaching
    // previousSubmissions must not surface mislabelled as submitted.
    const current = submittedReport({ id: 'report-3', submissionNumber: 3 })
    const abandonedDraft = submittedReport({
      id: 'report-2',
      status: 'in_progress',
      submissionNumber: 2,
      submittedAt: null,
      submittedBy: null
    })
    const submitted = submittedReport({ id: 'report-1', submissionNumber: 1 })
    const merged = period(current, {
      submissionNumber: 3,
      previousSubmissions: [abandonedDraft, submitted]
    })

    const result = buildAllSubmissionPeriods([merged])

    expect(result.map((item) => item.submissionNumber)).toEqual([1, 3])
    expect(result.map((item) => item.report?.id)).toEqual([
      'report-1',
      'report-3'
    ])
  })
})
