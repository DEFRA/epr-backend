import { toYear } from '#common/helpers/dates/year.js'
import { describe, it, expect, beforeEach } from 'vitest'

import {
  buildAccreditation,
  buildRegistration,
  createOrganisationBuilders
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import {
  buildCreateReportParams,
  createAndSubmitReport,
  reportKeyOf,
  uniqueRegistrationNumber
} from '#reports/repository/contract/test-data.js'
import { partialMock } from '#test/type-helpers.js'

import { diagnoseCancelledAccreditationReports } from './diagnose-cancelled-accreditation-reports.js'
import { toAccreditationNumber } from '#domain/organisations/numbers.js'
import { CADENCE } from '#reports/domain/cadence.js'

/** @import { Cadence } from '#reports/domain/cadence.js' */

const { buildOrganisation } = createOrganisationBuilders()

/** @import { Accreditation } from '#domain/organisations/accreditation.js' */
/** @import { ReportsRepository } from '#reports/repository/port.js' */

/** @param {Partial<Accreditation>} [overrides] */
const cancelledAccreditation = (overrides = {}) =>
  buildAccreditation({
    status: 'cancelled',
    accreditationNumber: toAccreditationNumber('A26RE000001PA'),
    material: 'paper',
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    statusHistory: [
      { status: 'created', updatedAt: new Date('2026-01-02T09:00:00.000Z') },
      { status: 'approved', updatedAt: new Date('2026-01-05T09:00:00.000Z') },
      { status: 'cancelled', updatedAt: new Date('2026-08-14T10:30:00.000Z') }
    ],
    ...overrides
  })

describe('diagnoseCancelledAccreditationReports', () => {
  /** @type {ReportsRepository} */
  let reportsRepository

  beforeEach(() => {
    reportsRepository = createInMemoryReportsRepository()()
  })

  /** @param {ReturnType<typeof buildOrganisation>[]} organisations */
  const diagnose = (organisations) =>
    diagnoseCancelledAccreditationReports(
      organisations.map((organisation) => partialMock(organisation)),
      reportsRepository.findPeriodicReports
    )

  it('describes a cancelled accreditation with every report of its registration', async () => {
    const accreditation = cancelledAccreditation()
    const registration = buildRegistration({
      accreditationId: accreditation.id,
      registrationNumber: uniqueRegistrationNumber()
    })
    const organisation = buildOrganisation({
      registrations: [registration],
      accreditations: [accreditation]
    })
    const reportKey = {
      ...reportKeyOf(organisation, registration),
      year: toYear(2026)
    }
    await createAndSubmitReport(reportsRepository, {
      ...reportKey,
      cadence: 'monthly',
      period: 1
    })
    await createAndSubmitReport(reportsRepository, {
      ...reportKey,
      cadence: 'monthly',
      period: 1,
      submissionNumber: 2
    })
    await reportsRepository.createReport(
      buildCreateReportParams({ ...reportKey, cadence: 'quarterly', period: 3 })
    )

    const { rows } = await diagnose([organisation])

    expect(rows).toStrictEqual([
      {
        organisationId: organisation.id,
        orgId: organisation.orgId,
        testOrganisation: false,
        accreditationId: accreditation.id,
        accreditationNumber: 'A26RE000001PA',
        material: 'paper',
        validFrom: '2026-01-01',
        validTo: '2026-12-31',
        cancelledAt: '2026-08-14T10:30:00.000Z',
        linkedRegistrations: 1,
        reports: [
          {
            registrationNumber: registration.registrationNumber,
            cadence: 'monthly',
            year: toYear(2026),
            period: 1,
            submissionNumber: 1,
            status: 'submitted',
            submittedAt: expect.any(String)
          },
          {
            registrationNumber: registration.registrationNumber,
            cadence: 'monthly',
            year: toYear(2026),
            period: 1,
            submissionNumber: 2,
            status: 'submitted',
            submittedAt: expect.any(String)
          },
          {
            registrationNumber: registration.registrationNumber,
            cadence: 'quarterly',
            year: toYear(2026),
            period: 3,
            submissionNumber: 1,
            status: 'in_progress',
            submittedAt: null
          }
        ]
      }
    ])
  })

  it('marks a cancelled accreditation held by a test organisation', async () => {
    const organisation = buildOrganisation({
      orgId: 999999,
      accreditations: [cancelledAccreditation()]
    })

    const { rows } = await diagnose([organisation])

    expect(rows).toStrictEqual([
      expect.objectContaining({ orgId: 999999, testOrganisation: true })
    ])
  })

  it('orders reports by year, cadence, period and submission', async () => {
    const accreditation = cancelledAccreditation()
    const registration = buildRegistration({
      accreditationId: accreditation.id,
      registrationNumber: uniqueRegistrationNumber()
    })
    const organisation = buildOrganisation({
      registrations: [registration],
      accreditations: [accreditation]
    })
    const base = {
      ...reportKeyOf(organisation, registration)
    }
    /** @type {[number, Cadence, number][]} */
    const reports = [
      [2026, CADENCE.quarterly, 1],
      [2026, CADENCE.monthly, 2],
      [2025, CADENCE.monthly, 12],
      [2026, CADENCE.monthly, 1]
    ]
    for (const [year, cadence, period] of reports) {
      await reportsRepository.createReport(
        buildCreateReportParams({
          ...base,
          year: toYear(year),
          cadence,
          period
        })
      )
    }

    const { rows } = await diagnose([organisation])

    expect(
      rows
        .flatMap((row) => row.reports)
        .map((r) => `${r.year}-${r.cadence}-${r.period}`)
    ).toStrictEqual([
      '2025-monthly-12',
      '2026-monthly-1',
      '2026-monthly-2',
      '2026-quarterly-1'
    ])
  })

  it('reads the date of the latest cancellation when the accreditation was cancelled more than once', async () => {
    const accreditation = cancelledAccreditation({
      statusHistory: [
        { status: 'approved', updatedAt: new Date('2026-01-05T09:00:00.000Z') },
        {
          status: 'cancelled',
          updatedAt: new Date('2026-03-01T09:00:00.000Z')
        },
        { status: 'approved', updatedAt: new Date('2026-04-01T09:00:00.000Z') },
        { status: 'cancelled', updatedAt: new Date('2026-07-20T12:00:00.000Z') }
      ]
    })
    const organisation = buildOrganisation({
      registrations: [],
      accreditations: [accreditation]
    })

    const { rows } = await diagnose([organisation])

    expect(rows.map((row) => row.cancelledAt)).toStrictEqual([
      '2026-07-20T12:00:00.000Z'
    ])
  })

  it('reports no cancellation date when the history does not record one', async () => {
    const accreditation = cancelledAccreditation({
      statusHistory: [
        { status: 'created', updatedAt: new Date('2026-01-02T09:00:00.000Z') }
      ]
    })
    const organisation = buildOrganisation({
      registrations: [],
      accreditations: [accreditation]
    })

    const { rows } = await diagnose([organisation])

    expect(rows.map((row) => row.cancelledAt)).toStrictEqual([null])
  })

  it('lists a cancelled accreditation with no number, window, linked registration or reports', async () => {
    const accreditation = cancelledAccreditation({
      accreditationNumber: undefined,
      validFrom: undefined,
      validTo: undefined
    })
    const organisation = buildOrganisation({
      registrations: [],
      accreditations: [accreditation]
    })

    const { rows } = await diagnose([organisation])

    expect(rows).toMatchObject([
      {
        accreditationNumber: null,
        validFrom: null,
        validTo: null,
        linkedRegistrations: 0,
        reports: []
      }
    ])
  })

  it('lists no reports for a linked registration that was never given a number', async () => {
    const accreditation = cancelledAccreditation()
    const registration = buildRegistration({
      accreditationId: accreditation.id,
      registrationNumber: null
    })
    const organisation = buildOrganisation({
      registrations: [registration],
      accreditations: [accreditation]
    })

    const { rows } = await diagnose([organisation])

    expect(rows).toMatchObject([{ linkedRegistrations: 1, reports: [] }])
  })

  it('leaves out accreditations that are not cancelled and reports of other registrations', async () => {
    const cancelled = cancelledAccreditation()
    const approved = buildAccreditation({ status: 'approved' })
    const cancelledRegistration = buildRegistration({
      accreditationId: cancelled.id,
      registrationNumber: uniqueRegistrationNumber()
    })
    const approvedRegistration = buildRegistration({
      accreditationId: approved.id,
      registrationNumber: uniqueRegistrationNumber()
    })
    const organisation = buildOrganisation({
      registrations: [cancelledRegistration, approvedRegistration],
      accreditations: [cancelled, approved]
    })
    await reportsRepository.createReport(
      buildCreateReportParams(reportKeyOf(organisation, approvedRegistration))
    )

    const { rows, summary } = await diagnose([organisation])

    expect(rows.map((row) => row.accreditationId)).toStrictEqual([cancelled.id])
    expect(rows.flatMap((row) => row.reports)).toStrictEqual([])
    expect(summary).toStrictEqual({
      scannedOrganisations: 1,
      scannedAccreditations: 2,
      cancelledAccreditations: 1,
      reports: 0
    })
  })

  it('totals the reports across every cancelled accreditation', async () => {
    const first = cancelledAccreditation()
    const second = cancelledAccreditation()
    const firstRegistration = buildRegistration({
      accreditationId: first.id,
      registrationNumber: uniqueRegistrationNumber()
    })
    const secondRegistration = buildRegistration({
      accreditationId: second.id,
      registrationNumber: uniqueRegistrationNumber()
    })
    const organisation = buildOrganisation({
      registrations: [firstRegistration, secondRegistration],
      accreditations: [first, second]
    })
    for (const registration of [firstRegistration, secondRegistration]) {
      await reportsRepository.createReport(
        buildCreateReportParams(reportKeyOf(organisation, registration))
      )
    }

    const { summary } = await diagnose([organisation])

    expect(summary).toStrictEqual({
      scannedOrganisations: 1,
      scannedAccreditations: 2,
      cancelledAccreditations: 2,
      reports: 2
    })
  })
})
