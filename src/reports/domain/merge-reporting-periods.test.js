import { describe, expect, it } from 'vitest'
import { mergeReportingPeriods } from './merge-reporting-periods.js'
import { REPORT_STATUS } from './report-status.js'

/**
 * Builds a report summary with the identity fields these tests assert on (not a
 * complete ReportSummary: activity payloads are omitted). A submitted report
 * always carries a submission instant, so `submittedAt` defaults to a fixed
 * timestamp when the status is submitted; override any field a test cares about.
 * @param {Partial<import('../repository/port.js').ReportSummary>} [overrides]
 * @returns {import('../repository/port.js').ReportSummary}
 */
const reportSummary = (overrides = {}) => {
  const status = overrides.status ?? REPORT_STATUS.IN_PROGRESS
  return {
    id: 'report-id',
    status: REPORT_STATUS.IN_PROGRESS,
    submissionNumber: 1,
    submittedAt:
      status === REPORT_STATUS.SUBMITTED ? '2026-02-15T00:00:00.000Z' : null,
    submittedBy: null,
    resubmissionRequired: null,
    ...overrides
  }
}

describe('mergeReportingPeriods', () => {
  const computedPeriods = [
    {
      year: 2026,
      period: 1,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      dueDate: '2026-02-20',
      report: null
    },
    {
      year: 2026,
      period: 2,
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      dueDate: '2026-03-20',
      report: null
    }
  ]

  it('returns computed periods unchanged when no persisted reports exist', () => {
    const result = mergeReportingPeriods(computedPeriods, [], 'monthly')

    expect(result).toHaveLength(2)
    expect(result[0].report).toBeNull()
    expect(result[1].report).toBeNull()
  })

  it('merges persisted report into matching period', () => {
    const periodicReports = [
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        year: 2026,
        reports: {
          monthly: {
            1: {
              startDate: '2026-01-01',
              endDate: '2026-01-31',
              dueDate: '2026-02-20',
              current: reportSummary({ id: 'report-uuid-1' }),
              previousSubmissions: []
            }
          }
        }
      }
    ]

    const result = mergeReportingPeriods(
      computedPeriods,
      periodicReports,
      'monthly'
    )

    expect(result[0].report).toEqual(reportSummary({ id: 'report-uuid-1' }))
    expect(result[1].report).toBeNull()
  })

  it('exposes report with submitted status when current report is submitted', () => {
    const periodicReports = [
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        year: 2026,
        reports: {
          monthly: {
            1: {
              startDate: '2026-01-01',
              endDate: '2026-01-31',
              dueDate: '2026-02-20',
              current: reportSummary({
                id: 'report-uuid-1',
                status: REPORT_STATUS.SUBMITTED
              }),
              previousSubmissions: []
            }
          }
        }
      }
    ]

    const result = mergeReportingPeriods(
      computedPeriods,
      periodicReports,
      'monthly'
    )

    expect(result[0].report).toEqual(
      reportSummary({ id: 'report-uuid-1', status: REPORT_STATUS.SUBMITTED })
    )
  })

  it('leaves submittedReports empty when the period has no submitted report', () => {
    const periodicReports = [
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        year: 2026,
        reports: {
          monthly: {
            1: {
              startDate: '2026-01-01',
              endDate: '2026-01-31',
              dueDate: '2026-02-20',
              current: reportSummary({ id: 'submission-1' }),
              previousSubmissions: []
            }
          }
        }
      }
    ]

    const result = mergeReportingPeriods(
      computedPeriods,
      periodicReports,
      'monthly'
    )

    // period 1 has only an in-flight draft; period 2 has no slot at all, so no
    // report has been submitted and the fan-out list is empty for both
    expect(result[0].submittedReports).toEqual([])
    expect(result[1].submittedReports).toEqual([])
  })

  it('lists submitted reports ascending, excluding the in-flight draft', () => {
    const periodicReports = [
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        year: 2026,
        reports: {
          monthly: {
            1: {
              startDate: '2026-01-01',
              endDate: '2026-01-31',
              dueDate: '2026-02-20',
              // current is the in-flight submission 3 draft; previousSubmissions
              // are ordered by submissionNumber descending
              current: reportSummary({
                id: 'submission-3',
                submissionNumber: 3
              }),
              previousSubmissions: [
                reportSummary({
                  id: 'submission-2',
                  status: REPORT_STATUS.SUBMITTED,
                  submissionNumber: 2
                }),
                reportSummary({
                  id: 'submission-1',
                  status: REPORT_STATUS.SUBMITTED,
                  submissionNumber: 1
                })
              ]
            }
          }
        }
      }
    ]

    const result = mergeReportingPeriods(
      computedPeriods,
      periodicReports,
      'monthly'
    )

    // report is the draft (current); submittedReports excludes it and lists the
    // submitted reports ascending, so the feed can emit one row per submission
    expect(result[0].report).toEqual(
      reportSummary({ id: 'submission-3', submissionNumber: 3 })
    )
    expect(result[0].submittedReports.map((r) => r.id)).toEqual([
      'submission-1',
      'submission-2'
    ])
  })

  it('selects the highest-numbered submission regardless of slot ordering', () => {
    const periodicReports = [
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        year: 2026,
        reports: {
          monthly: {
            1: {
              startDate: '2026-01-01',
              endDate: '2026-01-31',
              dueDate: '2026-02-20',
              // previousSubmissions deliberately in ascending order: selection
              // must go by submissionNumber, not by position in the array
              current: reportSummary({
                id: 'submission-3',
                submissionNumber: 3
              }),
              previousSubmissions: [
                reportSummary({
                  id: 'submission-1',
                  status: REPORT_STATUS.SUBMITTED,
                  submissionNumber: 1
                }),
                reportSummary({
                  id: 'submission-2',
                  status: REPORT_STATUS.SUBMITTED,
                  submissionNumber: 2
                })
              ]
            }
          }
        }
      }
    ]

    const result = mergeReportingPeriods(
      computedPeriods,
      periodicReports,
      'monthly'
    )

    // selection is by submissionNumber, not slot position, so the ascending
    // fan-out list is the same regardless of how previousSubmissions is arranged
    expect(result[0].submittedReports.map((r) => r.id)).toEqual([
      'submission-1',
      'submission-2'
    ])
  })

  it('keeps an unsubmitted-but-previously-submitted report in submittedReports', () => {
    const periodicReports = [
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        year: 2026,
        reports: {
          monthly: {
            1: {
              startDate: '2026-01-01',
              endDate: '2026-01-31',
              dueDate: '2026-02-20',
              // Submitted then unsubmitted: currentStatus reverts to
              // ready_to_submit but the submitted instant is retained
              current: reportSummary({
                id: 'submission-1',
                status: REPORT_STATUS.READY_TO_SUBMIT,
                submittedAt: '2026-02-10T00:00:00.000Z',
                submissionNumber: 1
              }),
              previousSubmissions: []
            }
          }
        }
      }
    ]

    const result = mergeReportingPeriods(
      computedPeriods,
      periodicReports,
      'monthly'
    )

    // The retained submission is still listed, so the feed keeps showing its
    // figures rather than blanking while it is a draft again
    expect(result[0].submittedReports.map((r) => r.submittedAt)).toEqual([
      '2026-02-10T00:00:00.000Z'
    ])
  })

  it('sets report to null when current is null (no active draft)', () => {
    const periodicReports = [
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        year: 2026,
        reports: {
          monthly: {
            1: {
              startDate: '2026-01-01',
              endDate: '2026-01-31',
              dueDate: '2026-02-20',
              current: null,
              previousSubmissions: [
                reportSummary({
                  id: 'old-report-id',
                  status: REPORT_STATUS.SUBMITTED
                })
              ]
            }
          }
        }
      }
    ]

    const result = mergeReportingPeriods(
      computedPeriods,
      periodicReports,
      'monthly'
    )

    expect(result[0].report).toBeNull()
  })

  it('includes persisted periods not in computed set when current is non-null', () => {
    const periodicReports = [
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        year: 2026,
        reports: {
          monthly: {
            3: {
              startDate: '2026-03-01',
              endDate: '2026-03-31',
              dueDate: '2026-04-20',
              current: reportSummary({ id: 'report-uuid-3' }),
              previousSubmissions: []
            }
          }
        }
      }
    ]

    const result = mergeReportingPeriods(
      computedPeriods,
      periodicReports,
      'monthly'
    )

    expect(result).toHaveLength(3)
    const period3 = result.find((p) => p.period === 3)
    expect(period3?.report).toEqual(reportSummary({ id: 'report-uuid-3' }))
    expect(period3?.startDate).toBe('2026-03-01')
  })

  it('ignores persisted slots with null current not in computed set', () => {
    const periodicReports = [
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        year: 2026,
        reports: {
          monthly: {
            3: {
              startDate: '2026-03-01',
              endDate: '2026-03-31',
              dueDate: '2026-04-20',
              current: null,
              previousSubmissions: [
                reportSummary({
                  id: 'old-id',
                  status: REPORT_STATUS.SUBMITTED
                })
              ]
            }
          }
        }
      }
    ]

    const result = mergeReportingPeriods(
      computedPeriods,
      periodicReports,
      'monthly'
    )

    expect(result).toHaveLength(2)
  })

  it('ignores slots from a different cadence', () => {
    const periodicReports = [
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        year: 2026,
        reports: {
          quarterly: {
            1: {
              startDate: '2026-01-01',
              endDate: '2026-03-31',
              dueDate: '2026-04-20',
              current: reportSummary({ id: 'quarterly-report' }),
              previousSubmissions: []
            }
          }
        }
      }
    ]

    const result = mergeReportingPeriods(
      computedPeriods,
      periodicReports,
      'monthly'
    )

    expect(result).toHaveLength(2)
    expect(result[0].report).toBeNull()
  })

  it('sorts output by year then period', () => {
    const periodicReports = [
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        year: 2025,
        reports: {
          monthly: {
            12: {
              startDate: '2025-12-01',
              endDate: '2025-12-31',
              dueDate: '2026-01-20',
              current: reportSummary({ id: 'report-2025-12' }),
              previousSubmissions: []
            }
          }
        }
      }
    ]

    const result = mergeReportingPeriods(
      computedPeriods,
      periodicReports,
      'monthly'
    )

    expect(result).toHaveLength(3)
    expect(result[0].year).toBe(2025)
    expect(result[0].period).toBe(12)
    expect(result[1].year).toBe(2026)
    expect(result[1].period).toBe(1)
  })
})
