import { ObjectId } from 'mongodb'
import { describe, expect, it, vi } from 'vitest'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import {
  diagnoseReportRow,
  findReviewableMonthlyReportRows,
  findStaleIssuedTonnageReports,
  formatStaleIssuedTonnageFinding
} from './stale-issued-tonnage.js'

const newId = () => new ObjectId().toHexString()

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
    startDate: '2025-06-01',
    endDate: '2025-06-30',
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
    /** @type {import('#reports/repository/port.js').PeriodicReport} */ (
      /** @type {unknown} */ ({
        organisationId: 'org-1',
        registrationId: 'reg-1',
        year: 2025,
        reports: {
          monthly: {
            6: {
              startDate: '2025-06-01',
              endDate: '2025-06-30',
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
    )

  it('includes a submitted monthly report with prn data', () => {
    const rows = findReviewableMonthlyReportRows([basePeriodicReport()])

    expect(rows).toEqual([
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        year: 2025,
        period: 6,
        startDate: '2025-06-01',
        endDate: '2025-06-30',
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

  it('includes a ready_to_submit report', () => {
    const periodicReport = basePeriodicReport({
      current: {
        id: 'report-1',
        status: 'ready_to_submit',
        prn: { issuedTonnage: 50 }
      }
    })

    const rows = findReviewableMonthlyReportRows([periodicReport])

    expect(rows).toHaveLength(1)
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

  it('counts a PRN issued in the afternoon of the period end date (last-day boundary)', () => {
    const row = buildRow({ storedIssuedTonnage: 50 })
    const issuedLateOnEndDate = new Date('2025-06-30T10:31:50.375Z')
    const prns = [
      buildPrn(50, {
        currentStatus: PRN_STATUS.ACCEPTED,
        currentStatusAt: issuedLateOnEndDate,
        issued: { at: issuedLateOnEndDate, by: ACTOR }
      })
    ]

    expect(diagnoseReportRow(row, prns)).toBeNull()
  })

  it('counts a PRN issued moments before midnight on the period end date', () => {
    const row = buildRow({ storedIssuedTonnage: 50 })
    const issuedAtEndOfDay = new Date('2025-06-30T23:59:59.998Z')
    const prns = [
      buildPrn(50, {
        currentStatus: PRN_STATUS.ACCEPTED,
        currentStatusAt: issuedAtEndOfDay,
        issued: { at: issuedAtEndOfDay, by: ACTOR }
      })
    ]

    expect(diagnoseReportRow(row, prns)).toBeNull()
  })

  it('counts a PRN issued at the first moment of the period start date', () => {
    const row = buildRow({ storedIssuedTonnage: 50 })
    const issuedAtStartOfDay = new Date('2025-06-01T00:00:00.000Z')
    const prns = [
      buildPrn(50, {
        currentStatus: PRN_STATUS.ACCEPTED,
        currentStatusAt: issuedAtStartOfDay,
        issued: { at: issuedAtStartOfDay, by: ACTOR }
      })
    ]

    expect(diagnoseReportRow(row, prns)).toBeNull()
  })

  it('excludes a PRN issued one millisecond after the period end date', () => {
    const row = buildRow({ storedIssuedTonnage: 0 })
    const issuedJustAfterEnd = new Date('2025-07-01T00:00:00.000Z')
    const prns = [
      buildPrn(50, {
        currentStatus: PRN_STATUS.ACCEPTED,
        currentStatusAt: issuedJustAfterEnd,
        issued: { at: issuedJustAfterEnd, by: ACTOR }
      })
    ]

    expect(diagnoseReportRow(row, prns)).toBeNull()
  })

  it('excludes a PRN issued one millisecond before the period start date', () => {
    const row = buildRow({ storedIssuedTonnage: 0 })
    const issuedJustBeforeStart = new Date('2025-05-31T23:59:59.999Z')
    const prns = [
      buildPrn(50, {
        currentStatus: PRN_STATUS.ACCEPTED,
        currentStatusAt: issuedJustBeforeStart,
        issued: { at: issuedJustBeforeStart, by: ACTOR }
      })
    ]

    expect(diagnoseReportRow(row, prns)).toBeNull()
  })

  it('includes issued-but-later-cancelled tonnage for a PRN cancelled after being issued late on the period end date', () => {
    const row = buildRow({ storedIssuedTonnage: 50 })
    const issuedLateOnEndDate = new Date('2025-06-30T10:22:50.901Z')
    const prns = [
      buildPrn(50, {
        currentStatus: PRN_STATUS.CANCELLED,
        currentStatusAt: AFTER_PERIOD,
        issued: { at: issuedLateOnEndDate, by: ACTOR },
        cancelled: { at: AFTER_PERIOD, by: ACTOR }
      })
    ]

    const finding = diagnoseReportRow(row, prns)

    expect(finding).toMatchObject({
      recalculatedTonnage: 0,
      issuedButLaterCancelledTonnage: 50
    })
  })

  it('includes issued-but-later-cancelled tonnage for a PRN awaiting cancellation after being issued late on the period end date', () => {
    const row = buildRow({ storedIssuedTonnage: 50 })
    const issuedLateOnEndDate = new Date('2025-06-30T10:22:50.901Z')
    const prns = [
      buildPrn(50, {
        currentStatus: PRN_STATUS.AWAITING_CANCELLATION,
        currentStatusAt: AFTER_PERIOD,
        issued: { at: issuedLateOnEndDate, by: ACTOR }
      })
    ]

    const finding = diagnoseReportRow(row, prns)

    expect(finding).toMatchObject({
      recalculatedTonnage: 0,
      issuedButLaterCancelledTonnage: 50
    })
  })

  it('excludes issued-but-later-cancelled tonnage for a cancelled PRN issued one millisecond after the period end date', () => {
    const row = buildRow({ storedIssuedTonnage: 0 })
    const issuedJustAfterEnd = new Date('2025-07-01T00:00:00.000Z')
    const prns = [
      buildPrn(50, {
        currentStatus: PRN_STATUS.CANCELLED,
        currentStatusAt: AFTER_PERIOD,
        issued: { at: issuedJustAfterEnd, by: ACTOR },
        cancelled: { at: AFTER_PERIOD, by: ACTOR }
      })
    ]

    expect(diagnoseReportRow(row, prns)).toBeNull()
  })

  it('excludes issued-but-later-cancelled tonnage for an awaiting-cancellation PRN issued one millisecond before the period start date', () => {
    const row = buildRow({ storedIssuedTonnage: 0 })
    const issuedJustBeforeStart = new Date('2025-05-31T23:59:59.999Z')
    const prns = [
      buildPrn(50, {
        currentStatus: PRN_STATUS.AWAITING_CANCELLATION,
        currentStatusAt: AFTER_PERIOD,
        issued: { at: issuedJustBeforeStart, by: ACTOR }
      })
    ]

    expect(diagnoseReportRow(row, prns)).toBeNull()
  })

  it('counts a PRN issued late on the period end date when the row stores full ISO datetime strings, not bare dates', () => {
    const row = buildRow({
      storedIssuedTonnage: 50,
      startDate: '2025-06-01T00:00:00.000Z',
      endDate: '2025-06-30T00:00:00.000Z'
    })
    const issuedLateOnEndDate = new Date('2025-06-30T10:31:50.375Z')
    const prns = [
      buildPrn(50, {
        currentStatus: PRN_STATUS.ACCEPTED,
        currentStatusAt: issuedLateOnEndDate,
        issued: { at: issuedLateOnEndDate, by: ACTOR }
      })
    ]

    expect(diagnoseReportRow(row, prns)).toBeNull()
  })

  it('includes issued-but-later-cancelled tonnage for a cancelled PRN issued late on the period end date when the row stores full ISO datetime strings', () => {
    const row = buildRow({
      storedIssuedTonnage: 50,
      startDate: '2025-06-01T00:00:00.000Z',
      endDate: '2025-06-30T00:00:00.000Z'
    })
    const issuedLateOnEndDate = new Date('2025-06-30T10:31:50.375Z')
    const prns = [
      buildPrn(50, {
        currentStatus: PRN_STATUS.CANCELLED,
        currentStatusAt: AFTER_PERIOD,
        issued: { at: issuedLateOnEndDate, by: ACTOR },
        cancelled: { at: AFTER_PERIOD, by: ACTOR }
      })
    ]

    const finding = diagnoseReportRow(row, prns)

    expect(finding).toMatchObject({
      recalculatedTonnage: 0,
      issuedButLaterCancelledTonnage: 50
    })
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
  /**
   * Builds a submitted monthly report document as it would be persisted,
   * seeded directly into the in-memory reports repository's store (bypassing
   * the create/status-transition API, which isn't needed for read-path tests).
   */
  const buildStoredReport = ({
    organisationId,
    registrationId,
    reportId = 'report-1',
    issuedTonnage = 999
  }) => ({
    id: reportId,
    version: 1,
    schemaVersion: 1,
    organisationId,
    registrationId,
    year: 2025,
    cadence: 'monthly',
    period: 6,
    submissionNumber: 1,
    startDate: '2025-06-01',
    endDate: '2025-06-30',
    dueDate: '2025-07-15T00:00:00.000Z',
    prn: { issuedTonnage },
    status: {
      currentStatus: 'submitted',
      currentStatusAt: '2025-07-01T00:00:00.000Z',
      submitted: { at: '2025-07-01T00:00:00.000Z', by: ACTOR },
      history: [
        { status: 'submitted', at: '2025-07-01T00:00:00.000Z', by: ACTOR }
      ]
    }
  })

  const APPROVED_STATUS_HISTORY = [
    { status: 'approved', updatedAt: '2025-01-01T00:00:00.000Z' }
  ]

  const buildOrganisationWithAccreditation = ({
    organisationId,
    registrationId,
    accreditationId
  }) =>
    /** @type {any} */ ({
      id: organisationId,
      statusHistory: APPROVED_STATUS_HISTORY,
      registrations: [
        {
          id: registrationId,
          accreditationId,
          statusHistory: APPROVED_STATUS_HISTORY
        }
      ],
      accreditations: accreditationId
        ? [{ id: accreditationId, statusHistory: APPROVED_STATUS_HISTORY }]
        : []
    })

  it('skips a row whose registration lookup throws (e.g. deleted org/registration)', async () => {
    const organisationId = newId()
    const registrationId = newId()
    const reportsRepository = createInMemoryReportsRepository(
      new Map([
        [
          'report-1',
          buildStoredReport({
            organisationId,
            registrationId
          })
        ]
      ])
    )()
    const organisationsRepository = createInMemoryOrganisationsRepository([])()
    const findByAccreditation = vi.fn()
    const packagingRecyclingNotesRepository = /** @type {any} */ ({
      findByAccreditation
    })

    const { scanned, findings } = await findStaleIssuedTonnageReports({
      reportsRepository,
      organisationsRepository,
      packagingRecyclingNotesRepository
    })

    expect(scanned).toBe(1)
    expect(findings).toEqual([])
    expect(findByAccreditation).not.toHaveBeenCalled()
  })

  it('skips a row whose registration has no accreditationId', async () => {
    const organisationId = newId()
    const registrationId = newId()
    const reportsRepository = createInMemoryReportsRepository(
      new Map([
        [
          'report-1',
          buildStoredReport({
            organisationId,
            registrationId
          })
        ]
      ])
    )()
    const organisationsRepository = createInMemoryOrganisationsRepository([
      buildOrganisationWithAccreditation({
        organisationId,
        registrationId,
        accreditationId: undefined
      })
    ])()
    const findByAccreditation = vi.fn()
    const packagingRecyclingNotesRepository = /** @type {any} */ ({
      findByAccreditation
    })

    const { findings } = await findStaleIssuedTonnageReports({
      reportsRepository,
      organisationsRepository,
      packagingRecyclingNotesRepository
    })

    expect(findings).toEqual([])
    expect(findByAccreditation).not.toHaveBeenCalled()
  })

  it('reuses a cached PRN list for a second row sharing the same accreditationId', async () => {
    const organisationId1 = newId()
    const registrationId1 = newId()
    const organisationId2 = newId()
    const registrationId2 = newId()
    const accreditationId = newId()
    const reportsRepository = createInMemoryReportsRepository(
      new Map([
        [
          'report-1',
          buildStoredReport({
            organisationId: organisationId1,
            registrationId: registrationId1,
            reportId: 'report-1'
          })
        ],
        [
          'report-2',
          buildStoredReport({
            organisationId: organisationId2,
            registrationId: registrationId2,
            reportId: 'report-2'
          })
        ]
      ])
    )()
    const organisationsRepository = createInMemoryOrganisationsRepository([
      buildOrganisationWithAccreditation({
        organisationId: organisationId1,
        registrationId: registrationId1,
        accreditationId
      }),
      buildOrganisationWithAccreditation({
        organisationId: organisationId2,
        registrationId: registrationId2,
        accreditationId
      })
    ])()
    const packagingRecyclingNotesRepository =
      createInMemoryPackagingRecyclingNotesRepository([])(
        /** @type {any} */ ({ error: vi.fn() })
      )
    const findByAccreditation = vi.spyOn(
      packagingRecyclingNotesRepository,
      'findByAccreditation'
    )

    const { scanned, findings } = await findStaleIssuedTonnageReports({
      reportsRepository,
      organisationsRepository,
      packagingRecyclingNotesRepository
    })

    expect(scanned).toBe(2)
    expect(findings).toHaveLength(2)
    expect(findByAccreditation).toHaveBeenCalledTimes(1)
  })

  it('does not report a row whose recalculated tonnage matches the stored value', async () => {
    const organisationId = newId()
    const registrationId = newId()
    const accreditationId = newId()
    const reportsRepository = createInMemoryReportsRepository(
      new Map([
        [
          'report-1',
          buildStoredReport({
            organisationId,
            registrationId,
            issuedTonnage: 0
          })
        ]
      ])
    )()
    const organisationsRepository = createInMemoryOrganisationsRepository([
      buildOrganisationWithAccreditation({
        organisationId,
        registrationId,
        accreditationId
      })
    ])()
    const packagingRecyclingNotesRepository =
      createInMemoryPackagingRecyclingNotesRepository([])(
        /** @type {any} */ ({ error: vi.fn() })
      )

    const { scanned, findings } = await findStaleIssuedTonnageReports({
      reportsRepository,
      organisationsRepository,
      packagingRecyclingNotesRepository
    })

    expect(scanned).toBe(1)
    expect(findings).toEqual([])
  })

  it('reports a PRN issued in the afternoon of the period end date as counted, not stale, end-to-end through the in-memory repos', async () => {
    const organisationId = newId()
    const registrationId = newId()
    const accreditationId = newId()
    const reportsRepository = createInMemoryReportsRepository(
      new Map([
        [
          'report-1',
          buildStoredReport({
            organisationId,
            registrationId,
            issuedTonnage: 50
          })
        ]
      ])
    )()
    const organisationsRepository = createInMemoryOrganisationsRepository([
      buildOrganisationWithAccreditation({
        organisationId,
        registrationId,
        accreditationId
      })
    ])()
    const packagingRecyclingNotesRepository =
      createInMemoryPackagingRecyclingNotesRepository(
        /** @type {any} */ ([
          {
            id: 'prn-1',
            organisation: { id: organisationId },
            registrationId,
            accreditation: { id: accreditationId },
            tonnage: 50,
            status: {
              currentStatus: PRN_STATUS.ACCEPTED,
              currentStatusAt: new Date('2025-06-30T10:31:50.375Z'),
              issued: {
                at: new Date('2025-06-30T10:31:50.375Z'),
                by: ACTOR
              },
              history: []
            }
          }
        ])
      )(/** @type {any} */ ({ error: vi.fn() }))

    const { findings } = await findStaleIssuedTonnageReports({
      reportsRepository,
      organisationsRepository,
      packagingRecyclingNotesRepository
    })

    expect(findings).toEqual([])
  })
})
