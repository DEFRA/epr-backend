import { ObjectId } from 'mongodb'
import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { asSupport, asOperator } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import {
  REPORT_STATUS,
  REPORT_STATUS_SLOT
} from '#reports/domain/report-status.js'
import {
  buildOrganisationWithRegistration,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { adminReportSubmissionsGetPath } from './admin-report-submissions.js'

/**
 * @import { TestServer } from '#test/create-test-server.js'
 */

describe(`GET ${adminReportSubmissionsGetPath}`, () => {
  setupAuthContext()

  const changedBy = { id: 'user-1', name: 'Test', position: 'Officer' }

  const makeUrl = (orgId, regId) =>
    `/v1/admin/organisations/${orgId}/registrations/${regId}/report-submissions`

  /**
   * @returns {Promise<{ server: TestServer, organisationId: string, registrationId: string, repo: object }>}
   */
  const setup = async () => {
    const reportsRepositoryFactory = createInMemoryReportsRepository()
    const registration = buildRegistration({
      wasteProcessingType: 'exporter',
      accreditationId: new ObjectId().toString()
    })
    const org = buildOrganisationWithRegistration(registration, 'approved')

    const server = await createTestServer({
      repositories: {
        organisationsRepository: createInMemoryOrganisationsRepository([org]),
        reportsRepository: reportsRepositoryFactory
      },
      featureFlags: createInMemoryFeatureFlags({})
    })

    return {
      server,
      organisationId: org.id,
      registrationId: registration.id,
      repo: reportsRepositoryFactory()
    }
  }

  const monthDates = (year, period) => ({
    startDate: `${year}-${String(period).padStart(2, '0')}-01`,
    endDate: `${year}-${String(period).padStart(2, '0')}-28`,
    dueDate: `${year}-${String(period + 1).padStart(2, '0')}-20`
  })

  const buildCreatePayload = ({
    organisationId,
    registrationId,
    year,
    period,
    submissionNumber
  }) => ({
    organisationId,
    registrationId,
    year,
    cadence: 'monthly',
    period,
    ...monthDates(year, period),
    changedBy,
    submissionNumber,
    material: 'plastic',
    wasteProcessingType: 'exporter',
    source: { summaryLogId: 'sl-1', lastUploadedAt: `${year}-01-15` },
    prn: null,
    recyclingActivity: {
      suppliers: [],
      totalTonnageReceived: 0,
      tonnageRecycled: null,
      tonnageNotRecycled: null
    },
    wasteSent: {
      tonnageSentToReprocessor: 0,
      tonnageSentToExporter: 0,
      tonnageSentToAnotherSite: 0,
      finalDestinations: []
    }
  })

  const submit = async (repo, id) => {
    await repo.updateReportStatus({
      reportId: id,
      version: 1,
      status: REPORT_STATUS.READY_TO_SUBMIT,
      slot: REPORT_STATUS_SLOT.READY,
      changedBy
    })
    await repo.updateReportStatus({
      reportId: id,
      version: 2,
      status: REPORT_STATUS.SUBMITTED,
      slot: REPORT_STATUS_SLOT.SUBMITTED,
      changedBy,
      submissionDeclaredBy: 'Test User'
    })
  }

  /** Submits submission N for the period, returning its report id. */
  const seedSubmitted = async (repo, args) => {
    const { id } = await repo.createReport(buildCreatePayload(args))
    await submit(repo, id)
    return id
  }

  const flagForResubmission = (
    repo,
    { organisationId, registrationId, year, period }
  ) =>
    repo.markSubmittedReportsRequiringResubmission({
      organisationId,
      registrationId,
      summaryLogId: 'sl-2',
      uploadedAt: `${year}-05-01T12:00:00.000Z`,
      periods: [{ year, cadence: 'monthly', period }]
    })

  const periodItems = async (
    server,
    organisationId,
    registrationId,
    p,
    injector = asSupport
  ) => {
    const response = await server.inject({
      method: 'GET',
      url: makeUrl(organisationId, registrationId),
      ...injector()
    })
    return JSON.parse(response.payload).reportingPeriods.filter(
      (item) => item.period === p
    )
  }

  it('returns 200 for an admin.read user', async () => {
    const { server, organisationId, registrationId } = await setup()

    const response = await server.inject({
      method: 'GET',
      url: makeUrl(organisationId, registrationId),
      ...asSupport()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
  })

  it('forbids a non-admin operator', async () => {
    const { server, organisationId, registrationId } = await setup()

    const response = await server.inject({
      method: 'GET',
      url: makeUrl(organisationId, registrationId),
      ...asOperator()
    })

    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
  })

  it('returns 404 for an unknown registration', async () => {
    const { server, organisationId } = await setup()

    const response = await server.inject({
      method: 'GET',
      url: makeUrl(organisationId, new ObjectId().toString()),
      ...asSupport()
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('lists every submission for a period after a completed resubmission cycle', async () => {
    const year = new Date().getUTCFullYear()
    const { server, organisationId, registrationId, repo } = await setup()

    const sub1 = await seedSubmitted(repo, {
      organisationId,
      registrationId,
      year,
      period: 1,
      submissionNumber: 1
    })
    await flagForResubmission(repo, {
      organisationId,
      registrationId,
      year,
      period: 1
    })
    const sub2 = await seedSubmitted(repo, {
      organisationId,
      registrationId,
      year,
      period: 1,
      submissionNumber: 2
    })

    const january = await periodItems(server, organisationId, registrationId, 1)

    expect(january.map((item) => item.submissionNumber)).toEqual([1, 2])
    expect(january.map((item) => item.periodStatus)).toEqual([
      'submitted',
      'submitted'
    ])
    expect(january[0].report.id).toBe(sub1)
    expect(january[1].report.id).toBe(sub2)
  })

  it('preserves the requires_resubmission skeleton for a flagged period', async () => {
    const year = new Date().getUTCFullYear()
    const { server, organisationId, registrationId, repo } = await setup()

    const sub1 = await seedSubmitted(repo, {
      organisationId,
      registrationId,
      year,
      period: 1,
      submissionNumber: 1
    })
    await flagForResubmission(repo, {
      organisationId,
      registrationId,
      year,
      period: 1
    })

    const january = await periodItems(server, organisationId, registrationId, 1)

    expect(january.map((item) => item.submissionNumber)).toEqual([1, 2])
    const original = january.find((item) => item.periodStatus === 'submitted')
    expect(original.report.id).toBe(sub1)
    const skeleton = january.find(
      (item) => item.periodStatus === 'requires_resubmission'
    )
    expect(skeleton).toMatchObject({ submissionNumber: 2, report: null })
  })

  it('curates historical submissions to the list shape', async () => {
    const year = new Date().getUTCFullYear()
    const { server, organisationId, registrationId, repo } = await setup()

    await seedSubmitted(repo, {
      organisationId,
      registrationId,
      year,
      period: 1,
      submissionNumber: 1
    })
    await flagForResubmission(repo, {
      organisationId,
      registrationId,
      year,
      period: 1
    })
    await seedSubmitted(repo, {
      organisationId,
      registrationId,
      year,
      period: 1,
      submissionNumber: 2
    })

    const january = await periodItems(server, organisationId, registrationId, 1)
    const superseded = january.find((item) => item.submissionNumber === 1)

    expect(Object.keys(superseded.report).sort()).toStrictEqual(
      ['id', 'status', 'submissionNumber', 'submittedAt', 'submittedBy'].sort()
    )
  })
})
