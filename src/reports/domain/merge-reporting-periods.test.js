import { describe, expect, it } from 'vitest'
import { mergeReportingPeriods } from './merge-reporting-periods.js'

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
    expect(result[0].report).toBeUndefined()
    expect(result[1].report).toBeUndefined()
  })

  it('merges persisted report into matching period', () => {
    const periodicReports = [
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        year: 2026,
        version: 1,
        reports: {
          monthly: {
            1: {
              startDate: '2026-01-01',
              endDate: '2026-01-31',
              dueDate: '2026-02-20',
              currentReportId: 'report-uuid-1',
              previousReportIds: []
            }
          }
        }
      }
    ]

    const statusMap = new Map([['report-uuid-1', 'in_progress']])
    const result = mergeReportingPeriods(
      computedPeriods,
      periodicReports,
      'monthly',
      statusMap
    )

    expect(result[0].report).toEqual({
      id: 'report-uuid-1',
      status: 'in_progress'
    })
    expect(result[1].report).toBeUndefined()
  })

  it('excludes report field when currentReportId is null (deleted)', () => {
    const periodicReports = [
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        year: 2026,
        version: 1,
        reports: {
          monthly: {
            1: {
              startDate: '2026-01-01',
              endDate: '2026-01-31',
              dueDate: '2026-02-20',
              currentReportId: null,
              previousReportIds: ['old-report-id']
            }
          }
        }
      }
    ]

    const result = mergeReportingPeriods(
      computedPeriods,
      periodicReports,
      'monthly',
      new Map()
    )

    expect(result[0].report).toBeUndefined()
  })

  it('includes persisted periods not in computed set', () => {
    const periodicReports = [
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        year: 2026,
        version: 1,
        reports: {
          monthly: {
            3: {
              startDate: '2026-03-01',
              endDate: '2026-03-31',
              dueDate: '2026-04-20',
              currentReportId: 'report-uuid-3',
              previousReportIds: []
            }
          }
        }
      }
    ]

    const statusMap = new Map([['report-uuid-3', 'submitted']])
    const result = mergeReportingPeriods(
      computedPeriods,
      periodicReports,
      'monthly',
      statusMap
    )

    expect(result).toHaveLength(3)
    const period3 = result.find((p) => p.period === 3)
    expect(period3.report).toEqual({ id: 'report-uuid-3', status: 'submitted' })
    expect(period3.startDate).toBe('2026-03-01')
  })

  it('ignores persisted slots with null currentReportId not in computed set', () => {
    const periodicReports = [
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        year: 2026,
        version: 1,
        reports: {
          monthly: {
            3: {
              startDate: '2026-03-01',
              endDate: '2026-03-31',
              dueDate: '2026-04-20',
              currentReportId: null,
              previousReportIds: ['old-id']
            }
          }
        }
      }
    ]

    const result = mergeReportingPeriods(
      computedPeriods,
      periodicReports,
      'monthly',
      new Map()
    )

    expect(result).toHaveLength(2)
  })

  it('ignores slots from a different cadence', () => {
    const periodicReports = [
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        year: 2026,
        version: 1,
        reports: {
          quarterly: {
            1: {
              startDate: '2026-01-01',
              endDate: '2026-03-31',
              dueDate: '2026-04-20',
              currentReportId: 'quarterly-report',
              previousReportIds: []
            }
          }
        }
      }
    ]

    const result = mergeReportingPeriods(
      computedPeriods,
      periodicReports,
      'monthly',
      new Map()
    )

    expect(result).toHaveLength(2)
    expect(result[0].report).toBeUndefined()
  })

  it('defaults status to in_progress when reportStatusMap has no entry', () => {
    const periodicReports = [
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        year: 2026,
        version: 1,
        reports: {
          monthly: {
            1: {
              startDate: '2026-01-01',
              endDate: '2026-01-31',
              dueDate: '2026-02-20',
              currentReportId: 'report-uuid-1',
              previousReportIds: []
            }
          }
        }
      }
    ]

    const result = mergeReportingPeriods(
      computedPeriods,
      periodicReports,
      'monthly',
      new Map()
    )

    expect(result[0].report).toEqual({
      id: 'report-uuid-1',
      status: 'in_progress'
    })
  })

  it('defaults status for persisted-only periods not in computed set', () => {
    const periodicReports = [
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        year: 2026,
        version: 1,
        reports: {
          monthly: {
            3: {
              startDate: '2026-03-01',
              endDate: '2026-03-31',
              dueDate: '2026-04-20',
              currentReportId: 'report-uuid-3',
              previousReportIds: []
            }
          }
        }
      }
    ]

    const result = mergeReportingPeriods(
      computedPeriods,
      periodicReports,
      'monthly',
      new Map()
    )

    const period3 = result.find((p) => p.period === 3)
    expect(period3.report).toEqual({
      id: 'report-uuid-3',
      status: 'in_progress'
    })
  })

  it('sorts output by year then period', () => {
    const periodicReports = [
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        year: 2025,
        version: 1,
        reports: {
          monthly: {
            12: {
              startDate: '2025-12-01',
              endDate: '2025-12-31',
              dueDate: '2026-01-20',
              currentReportId: 'report-2025-12',
              previousReportIds: []
            }
          }
        }
      }
    ]

    const statusMap = new Map([['report-2025-12', 'submitted']])
    const result = mergeReportingPeriods(
      computedPeriods,
      periodicReports,
      'monthly',
      statusMap
    )

    expect(result).toHaveLength(3)
    expect(result[0].year).toBe(2025)
    expect(result[0].period).toBe(12)
    expect(result[1].year).toBe(2026)
    expect(result[1].period).toBe(1)
  })
})
