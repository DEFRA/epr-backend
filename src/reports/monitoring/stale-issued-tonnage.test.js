import { describe, expect, it, vi } from 'vitest'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import {
  diagnoseReportRow,
  findReviewableMonthlyReportRows,
  findStaleIssuedTonnageReports,
  formatStaleIssuedTonnageFinding
} from './stale-issued-tonnage.js'

const ACTOR = { id: 'u', name: 'U' }
const IN_PERIOD = new Date('2025-06-15T12:00:00Z')
const AFTER_PERIOD = new Date('2025-07-15T12:00:00Z')

/**
 * @param {number} tonnage
 * @param {object} status
 */
function buildPrn(tonnage, status) {
  return /** @type {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} */ ({
    id: 'prn-1',
    tonnage,
    status
  })
}

function buildRow(overrides = {}) {
  return {
    organisationId: 'org-1',
    registrationId: 'reg-1',
    year: 2025,
    period: 6,
    startDate: '2025-06-01T00:00:00.000Z',
    endDate: '2025-06-30T23:59:59.999Z',
    reportId: 'report-1',
    reportStatus: 'submitted',
    storedIssuedTonnage: 50,
    ...overrides
  }
}

describe('findReviewableMonthlyReportRows', () => {
  /**
   * @param {object} [monthlyOverrides]
   * @returns {import('#reports/repository/port.js').PeriodicReport}
   */
  const basePeriodicReport = (monthlyOverrides = {}) =>
    /** @type {import('#reports/repository/port.js').PeriodicReport} */ ({
      organisationId: 'org-1',
      registrationId: 'reg-1',
      year: 2025,
      reports: {
        monthly: {
          6: {
            startDate: '2025-06-01T00:00:00.000Z',
            endDate: '2025-06-30T23:59:59.999Z',
            dueDate: '2025-07-15T00:00:00.000Z',
            current: {
              id: 'report-1',
              status: 'submitted',
              prn: { issuedTonnage: 50 }
            },
            previousSubmissions: [],
            ...monthlyOverrides
          }
        }
      }
    })

  it('includes a submitted monthly report with prn data', () => {
    const rows = findReviewableMonthlyReportRows([basePeriodicReport()])

    expect(rows).toEqual([
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        year: 2025,
        period: 6,
        startDate: '2025-06-01T00:00:00.000Z',
        endDate: '2025-06-30T23:59:59.999Z',
        reportId: 'report-1',
        reportStatus: 'submitted',
        storedIssuedTonnage: 50
      }
    ])
  })

  it('includes an in_progress monthly report', () => {
    const periodicReport = basePeriodicReport({
      current: {
        id: 'report-1',
        status: 'in_progress',
        prn: { issuedTonnage: 0 }
      }
    })

    const rows = findReviewableMonthlyReportRows([periodicReport])

    expect(rows).toHaveLength(1)
  })

  it('excludes a ready_to_submit report', () => {
    const periodicReport = basePeriodicReport({
      current: {
        id: 'report-1',
        status: 'ready_to_submit',
        prn: { issuedTonnage: 50 }
      }
    })

    expect(findReviewableMonthlyReportRows([periodicReport])).toEqual([])
  })

  it('excludes a report with no prn data (non-accredited operator)', () => {
    const periodicReport = basePeriodicReport({
      current: { id: 'report-1', status: 'submitted', prn: undefined }
    })

    expect(findReviewableMonthlyReportRows([periodicReport])).toEqual([])
  })

  it('excludes quarterly reports', () => {
    const periodicReport =
      /** @type {import('#reports/repository/port.js').PeriodicReport} */ (
        /** @type {unknown} */ ({
          organisationId: 'org-1',
          registrationId: 'reg-1',
          year: 2025,
          reports: {
            quarterly: {
              2: {
                startDate: '2025-04-01T00:00:00.000Z',
                endDate: '2025-06-30T23:59:59.999Z',
                dueDate: '2025-07-15T00:00:00.000Z',
                current: {
                  id: 'report-1',
                  status: 'submitted',
                  prn: { issuedTonnage: 50 }
                },
                previousSubmissions: []
              }
            }
          }
        })
      )

    expect(findReviewableMonthlyReportRows([periodicReport])).toEqual([])
  })

  it('excludes a period with no current report', () => {
    const periodicReport = basePeriodicReport({ current: null })

    expect(findReviewableMonthlyReportRows([periodicReport])).toEqual([])
  })
})

describe('diagnoseReportRow', () => {
  it('returns null when recalculated tonnage matches the stored value', () => {
    const row = buildRow({ storedIssuedTonnage: 50 })
    const prns = [
      buildPrn(50, {
        currentStatus: PRN_STATUS.ACCEPTED,
        currentStatusAt: IN_PERIOD,
        issued: { at: IN_PERIOD, by: ACTOR }
      })
    ]

    expect(diagnoseReportRow(row, prns)).toBeNull()
  })

  it('returns a finding when a PRN issued in-period was later cancelled', () => {
    const row = buildRow({ storedIssuedTonnage: 50 })
    const prns = [
      buildPrn(50, {
        currentStatus: PRN_STATUS.CANCELLED,
        currentStatusAt: AFTER_PERIOD,
        issued: { at: IN_PERIOD, by: ACTOR },
        cancelled: { at: AFTER_PERIOD, by: ACTOR }
      })
    ]

    const finding = diagnoseReportRow(row, prns)

    expect(finding).toEqual({
      organisationId: 'org-1',
      registrationId: 'reg-1',
      reportId: 'report-1',
      month: 'Jun 2025',
      reportStatus: 'submitted',
      storedIssuedTonnage: 50,
      recalculatedTonnage: 0,
      issuedButLaterCancelledTonnage: 50
    })
  })

  it('returns a finding for a mismatch unrelated to cancellation, with zero cancelled tonnage', () => {
    const row = buildRow({ storedIssuedTonnage: 999 })
    const prns = [
      buildPrn(50, {
        currentStatus: PRN_STATUS.ACCEPTED,
        currentStatusAt: IN_PERIOD,
        issued: { at: IN_PERIOD, by: ACTOR }
      })
    ]

    const finding = diagnoseReportRow(row, prns)

    expect(finding).toMatchObject({
      storedIssuedTonnage: 999,
      recalculatedTonnage: 50,
      issuedButLaterCancelledTonnage: 0
    })
  })

  it('returns null when a PRN is cancelled but was issued outside the period', () => {
    const row = buildRow({ storedIssuedTonnage: 0 })
    const outsidePeriod = new Date('2025-05-01T00:00:00Z')
    const prns = [
      buildPrn(50, {
        currentStatus: PRN_STATUS.CANCELLED,
        currentStatusAt: AFTER_PERIOD,
        issued: { at: outsidePeriod, by: ACTOR },
        cancelled: { at: AFTER_PERIOD, by: ACTOR }
      })
    ]

    expect(diagnoseReportRow(row, prns)).toBeNull()
  })
})

describe('formatStaleIssuedTonnageFinding', () => {
  it('renders a single reviewable line with the key figures', () => {
    const line = formatStaleIssuedTonnageFinding({
      organisationId: 'org-1',
      registrationId: 'reg-1',
      reportId: 'report-1',
      month: 'Jun 2025',
      reportStatus: 'submitted',
      storedIssuedTonnage: 50,
      recalculatedTonnage: 0,
      issuedButLaterCancelledTonnage: 50
    })

    expect(line).toBe(
      'Stale issued tonnage: org org-1 / registration reg-1, ' +
        'report report-1 (Jun 2025, submitted) — ' +
        'stored 50, recalculated 0, issued-but-later-cancelled 50'
    )
  })
})

describe('findStaleIssuedTonnageReports', () => {
  const periodicReportFor = (organisationId, registrationId) => ({
    organisationId,
    registrationId,
    year: 2025,
    reports: {
      monthly: {
        6: {
          startDate: '2025-06-01T00:00:00.000Z',
          endDate: '2025-06-30T23:59:59.999Z',
          dueDate: '2025-07-15T00:00:00.000Z',
          current: {
            id: 'report-1',
            status: 'submitted',
            prn: { issuedTonnage: 999 }
          },
          previousSubmissions: []
        }
      }
    }
  })

  it('skips a row whose registration lookup throws (e.g. deleted org/registration)', async () => {
    const packagingRecyclingNotesRepository = {
      findByAccreditation: vi.fn()
    }
    const { scanned, findings } = await findStaleIssuedTonnageReports(
      /** @type {any} */ ({
        reportsRepository: {
          findAllPeriodicReports: vi
            .fn()
            .mockResolvedValue([periodicReportFor('org-1', 'reg-1')])
        },
        organisationsRepository: {
          findRegistrationById: vi
            .fn()
            .mockRejectedValue(new Error('not found'))
        },
        packagingRecyclingNotesRepository
      })
    )

    expect(scanned).toBe(1)
    expect(findings).toEqual([])
    expect(
      packagingRecyclingNotesRepository.findByAccreditation
    ).not.toHaveBeenCalled()
  })

  it('skips a row whose registration has no accreditationId', async () => {
    const packagingRecyclingNotesRepository = {
      findByAccreditation: vi.fn()
    }
    const { findings } = await findStaleIssuedTonnageReports(
      /** @type {any} */ ({
        reportsRepository: {
          findAllPeriodicReports: vi
            .fn()
            .mockResolvedValue([periodicReportFor('org-1', 'reg-1')])
        },
        organisationsRepository: {
          findRegistrationById: vi.fn().mockResolvedValue({})
        },
        packagingRecyclingNotesRepository
      })
    )

    expect(findings).toEqual([])
    expect(
      packagingRecyclingNotesRepository.findByAccreditation
    ).not.toHaveBeenCalled()
  })

  it('reuses a cached PRN list for a second row sharing the same accreditationId', async () => {
    const findByAccreditation = vi.fn().mockResolvedValue([])
    const { scanned, findings } = await findStaleIssuedTonnageReports(
      /** @type {any} */ ({
        reportsRepository: {
          findAllPeriodicReports: vi
            .fn()
            .mockResolvedValue([
              periodicReportFor('org-1', 'reg-1'),
              periodicReportFor('org-2', 'reg-2')
            ])
        },
        organisationsRepository: {
          findRegistrationById: vi
            .fn()
            .mockResolvedValue({ accreditationId: 'acc-1' })
        },
        packagingRecyclingNotesRepository: { findByAccreditation }
      })
    )

    expect(scanned).toBe(2)
    expect(findings).toHaveLength(2)
    expect(findByAccreditation).toHaveBeenCalledTimes(1)
  })

  it('does not report a row whose recalculated tonnage matches the stored value', async () => {
    const periodicReport = periodicReportFor('org-1', 'reg-1')
    periodicReport.reports.monthly[6].current.prn.issuedTonnage = 0

    const { scanned, findings } = await findStaleIssuedTonnageReports(
      /** @type {any} */ ({
        reportsRepository: {
          findAllPeriodicReports: vi.fn().mockResolvedValue([periodicReport])
        },
        organisationsRepository: {
          findRegistrationById: vi
            .fn()
            .mockResolvedValue({ accreditationId: 'acc-1' })
        },
        packagingRecyclingNotesRepository: {
          findByAccreditation: vi.fn().mockResolvedValue([])
        }
      })
    )

    expect(scanned).toBe(1)
    expect(findings).toEqual([])
  })
})
