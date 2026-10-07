import { StatusCodes } from 'http-status-codes'

import { createTestServer } from '#test/create-test-server.js'
import {
  asOperator,
  asServiceMaintainer,
  asServiceMaintainerWrite
} from '#test/inject-auth.js'
import { partialMock } from '#test/type-helpers.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import {
  buildCreateReportParams,
  createAndSubmitReport
} from '#reports/repository/contract/test-data.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import {
  REPROCESSOR_NUMBER,
  accreditation,
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'

/** @import { ReportsRepository } from '#reports/repository/port.js' */

vi.mock('#reports/application/audit.js', () => ({
  auditReportCreate: vi.fn().mockResolvedValue(undefined),
  auditReportDelete: vi.fn().mockResolvedValue(undefined),
  auditReportStatusTransition: vi.fn().mockResolvedValue(undefined),
  auditReportRequestResubmission: vi.fn().mockResolvedValue(undefined)
}))

const REGISTERED_ONLY_NUMBER = 'R26ER5001180099PL'
const YEAR = 2026

const accredited = accreditation()
const registeredOnlyRegistration = reprocessor({
  registrationNumber: REGISTERED_ONLY_NUMBER
})
const accreditedRegistration = reprocessor({ accreditationId: accredited.id })
const organisation = buildOrganisation({
  registrations: [registeredOnlyRegistration, accreditedRegistration],
  accreditations: [accredited]
})

const registrations = `/organisations/${organisation.orgId}/registrations`

const streams = [
  {
    stream: 'registered-only',
    registration: registeredOnlyRegistration,
    cadence: 'quarterly',
    periods: { inProgress: 1, submitted: 2, created: 3 },
    seeded: { inProgress: '', submitted: '' },
    reports: `${registrations}/${REGISTERED_ONLY_NUMBER}/reports/${YEAR}/quarterly`
  },
  {
    stream: 'accredited',
    registration: accreditedRegistration,
    cadence: 'monthly',
    periods: { inProgress: 7, submitted: 8, created: 9 },
    seeded: { inProgress: '', submitted: '' },
    reports: `${registrations}/${REPROCESSOR_NUMBER}/accreditations/${YEAR}/reports/monthly`
  }
]

const COMPLETE_REPORT = {
  recyclingActivity: {
    suppliers: [],
    totalTonnageReceived: 0,
    tonnageRecycled: 0,
    tonnageNotRecycled: 0
  },
  prn: { issuedTonnage: 0, totalRevenue: 0, freeTonnage: 0 }
}

describe('report routes by natural key', () => {
  setupAuthContext()

  /** @type {Awaited<ReturnType<typeof createTestServer>>} */
  let server
  /** @type {ReportsRepository} */
  let reportsRepository

  beforeEach(async () => {
    const reportsRepositoryFactory = createInMemoryReportsRepository()
    reportsRepository = reportsRepositoryFactory()

    for (const { registration, cadence, periods, seeded } of streams) {
      /** @param {number} period */
      const forPeriod = (period) => ({
        organisationId: organisation.id,
        registrationId: registration.id,
        year: YEAR,
        cadence,
        period
      })
      const inProgress = await reportsRepository.createReport(
        buildCreateReportParams({
          ...forPeriod(periods.inProgress),
          ...COMPLETE_REPORT
        })
      )
      const submitted = await createAndSubmitReport(
        reportsRepository,
        forPeriod(periods.submitted)
      )
      seeded.inProgress = inProgress.id
      seeded.submitted = submitted
    }

    server = await createTestServer({
      repositories: {
        organisationsRepository: createInMemoryOrganisationsRepository([
          partialMock(organisation)
        ]),
        reportsRepository: reportsRepositoryFactory
      }
    })
  })

  afterEach(async () => {
    await server.stop()
  })

  /**
   * @param {string} reports
   * @param {number} period
   */
  const submission = (reports, period) => `${reports}/${period}/submissions/1`

  describe.each(streams)(
    'for the $stream stream',
    ({ registration, reports, periods, seeded }) => {
      const inProgress = submission(reports, periods.inProgress)
      const submitted = submission(reports, periods.submitted)

      it('creates a report', async () => {
        const response = await server.inject({
          method: 'POST',
          url: submission(reports, periods.created),
          ...asOperator()
        })

        expect(response.statusCode).toBe(StatusCodes.CREATED)
        const report = await reportsRepository.findReportById(
          JSON.parse(response.payload).id
        )
        expect(report).toMatchObject({
          organisationId: organisation.id,
          registrationId: registration.id,
          period: periods.created
        })
      })

      it('reads a report', async () => {
        const response = await server.inject({
          method: 'GET',
          url: inProgress,
          ...asOperator()
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(JSON.parse(response.payload).id).toBe(seeded.inProgress)
      })

      it('updates a report', async () => {
        const response = await server.inject({
          method: 'PATCH',
          url: inProgress,
          payload: { supportingInformation: 'Updated by number' },
          ...asOperator()
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const report = await reportsRepository.findReportById(seeded.inProgress)
        expect(report.supportingInformation).toBe('Updated by number')
      })

      it("changes a report's status", async () => {
        const response = await server.inject({
          method: 'POST',
          url: `${inProgress}/status`,
          payload: { status: REPORT_STATUS.READY_TO_SUBMIT, version: 1 },
          ...asOperator()
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const report = await reportsRepository.findReportById(seeded.inProgress)
        expect(report.status.currentStatus).toBe(REPORT_STATUS.READY_TO_SUBMIT)
      })

      it('deletes a report', async () => {
        const response = await server.inject({
          method: 'DELETE',
          url: inProgress,
          ...asOperator()
        })

        expect(response.statusCode).toBe(StatusCodes.NO_CONTENT)
        await expect(
          reportsRepository.findReportById(seeded.inProgress)
        ).rejects.toThrow()
      })

      it('unsubmits a report', async () => {
        const response = await server.inject({
          method: 'POST',
          url: `${submitted}/unsubmit`,
          ...asServiceMaintainerWrite()
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const report = await reportsRepository.findReportById(seeded.submitted)
        expect(report.status.currentStatus).toBe(REPORT_STATUS.READY_TO_SUBMIT)
      })

      it('requests a resubmission', async () => {
        const response = await server.inject({
          method: 'POST',
          url: `${submitted}/request-resubmission`,
          ...asOperator()
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const report = await reportsRepository.findReportById(seeded.submitted)
        expect(report.resubmissionRequired).toBeDefined()
      })
    }
  )

  it("serves a registration's reporting calendar", async () => {
    const response = await server.inject({
      method: 'GET',
      url: `${registrations}/${REGISTERED_ONLY_NUMBER}/reports/calendar`,
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload).cadence).toBe('quarterly')
  })

  it.each([
    [
      'an unknown organisation',
      `/organisations/999999/registrations/${REPROCESSOR_NUMBER}/reports/${YEAR}/quarterly/1/submissions/1`
    ],
    [
      'an unknown registration',
      `${registrations}/R26XX0000000000PL/reports/${YEAR}/quarterly/1/submissions/1`
    ],
    [
      'a year the registration has no accreditation for',
      `${registrations}/${REPROCESSOR_NUMBER}/accreditations/2027/reports/monthly/1/submissions/1`
    ],
    [
      'a registration with no accreditation',
      `${registrations}/${REGISTERED_ONLY_NUMBER}/accreditations/${YEAR}/reports/monthly/1/submissions/1`
    ],
    [
      'the calendar of an unknown registration',
      `${registrations}/R26XX0000000000PL/reports/calendar`
    ]
  ])('returns 404 for %s', async (_, url) => {
    const response = await server.inject({
      method: 'GET',
      url,
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it.each([
    [
      'a monthly report in the registered-only stream',
      `${registrations}/${REGISTERED_ONLY_NUMBER}/reports/${YEAR}/monthly/1/submissions/1`
    ],
    [
      'a quarterly report in the accredited stream',
      `${registrations}/${REPROCESSOR_NUMBER}/accreditations/${YEAR}/reports/quarterly/1/submissions/1`
    ]
  ])('rejects %s', async (_, url) => {
    const response = await server.inject({
      method: 'GET',
      url,
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })
})
