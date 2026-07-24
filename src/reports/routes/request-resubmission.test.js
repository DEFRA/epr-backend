import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer, asOperator } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { partialMock } from '#test/type-helpers.js'
import {
  buildOrganisationWithRegistration,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import {
  buildCreateReportParams,
  createAndSubmitReport
} from '#reports/repository/contract/test-data.js'
import { config } from '#root/config.js'
import { reportsRequestResubmissionPath } from './request-resubmission.js'
import * as reportAudit from '#reports/application/audit.js'

/** @import { Registration } from '#domain/organisations/registration.js' */

const CLOSED_PERIOD_ADJUSTMENTS = 'featureFlags.closedPeriodAdjustments'

vi.mock('#reports/application/audit.js', () => ({
  auditReportRequestResubmission: vi.fn().mockResolvedValue(undefined)
}))

describe(`POST ${reportsRequestResubmissionPath}`, () => {
  setupAuthContext()

  const makeUrl = (
    orgId,
    regId,
    year = 2024,
    cadence = 'monthly',
    period = 1,
    submissionNumber = 1
  ) =>
    `/v1/organisations/${orgId}/registrations/${regId}/reports/${year}/${cadence}/${period}/submissions/${submissionNumber}/request-resubmission`

  const buildServerWithSubmittedReport = async () => {
    const registration = buildRegistration({
      wasteProcessingType: 'reprocessor',
      accreditationId: undefined
    })
    const org = buildOrganisationWithRegistration(
      /** @type {Registration} */ (registration)
    )

    const reportsRepositoryFactory = createInMemoryReportsRepository()
    const reportsRepository = reportsRepositoryFactory()

    const reportId = await createAndSubmitReport(reportsRepository, {
      organisationId: org.id,
      registrationId: registration.id,
      year: 2024,
      cadence: 'monthly',
      period: 1
    })

    const server = await createTestServer({
      repositories: {
        organisationsRepository: createInMemoryOrganisationsRepository([
          partialMock(org)
        ]),
        reportsRepository: reportsRepositoryFactory
      },
      featureFlags: createInMemoryFeatureFlags()
    })

    return {
      server,
      organisationId: org.id,
      registrationId: registration.id,
      reportId,
      reportsRepository
    }
  }

  beforeEach(() => {
    config.set(CLOSED_PERIOD_ADJUSTMENTS, true)
    vi.clearAllMocks()
  })

  afterEach(() => {
    config.set(CLOSED_PERIOD_ADJUSTMENTS, false)
  })

  describe('successful request', () => {
    it('returns 200 with status requires_resubmission', async () => {
      const { server, organisationId, registrationId } =
        await buildServerWithSubmittedReport()

      const response = await server.inject({
        method: 'POST',
        url: makeUrl(organisationId, registrationId),
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual({
        status: 'requires_resubmission'
      })
    })

    it('sets resubmissionRequired.operatorRequested on the report', async () => {
      const {
        server,
        organisationId,
        registrationId,
        reportsRepository,
        reportId
      } = await buildServerWithSubmittedReport()

      await server.inject({
        method: 'POST',
        url: makeUrl(organisationId, registrationId),
        ...asOperator()
      })

      const updated = await reportsRepository.findReportById(reportId)
      expect(updated.resubmissionRequired?.operatorRequested).toMatchObject({
        requestedAt: expect.any(String),
        requestedBy: expect.objectContaining({ id: 'test-user-id' })
      })
    })

    it('calls auditReportRequestResubmission with correct params', async () => {
      const { server, organisationId, registrationId, reportId } =
        await buildServerWithSubmittedReport()

      await server.inject({
        method: 'POST',
        url: makeUrl(organisationId, registrationId),
        ...asOperator()
      })

      expect(reportAudit.auditReportRequestResubmission).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          organisationId,
          registrationId,
          year: 2024,
          cadence: 'monthly',
          period: 1,
          submissionNumber: 1,
          reportId,
          resubmissionRequired: expect.objectContaining({
            operatorRequested: expect.any(Object)
          })
        })
      )
    })

    it('returns 409 on a second call — already requested', async () => {
      const { server, organisationId, registrationId } =
        await buildServerWithSubmittedReport()

      await server.inject({
        method: 'POST',
        url: makeUrl(organisationId, registrationId),
        ...asOperator()
      })
      const second = await server.inject({
        method: 'POST',
        url: makeUrl(organisationId, registrationId),
        ...asOperator()
      })

      expect(second.statusCode).toBe(StatusCodes.CONFLICT)
      expect(JSON.parse(second.payload).reason).toBe(
        'resubmission_already_requested'
      )
    })
  })

  describe('authorisation', () => {
    it('returns 401 for an unauthenticated request', async () => {
      const { server, organisationId, registrationId } =
        await buildServerWithSubmittedReport()

      const response = await server.inject({
        method: 'POST',
        url: makeUrl(organisationId, registrationId)
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 200 for the operator themselves (organisationWrite scope)', async () => {
      const { server, organisationId, registrationId } =
        await buildServerWithSubmittedReport()

      const response = await server.inject({
        method: 'POST',
        url: makeUrl(organisationId, registrationId),
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })
  })

  describe('error handling', () => {
    it('returns 404 when no report exists for the period', async () => {
      const registration = buildRegistration({
        wasteProcessingType: 'reprocessor'
      })
      const org = buildOrganisationWithRegistration(
        /** @type {Registration} */ (registration)
      )

      const server = await createTestServer({
        repositories: {
          organisationsRepository: createInMemoryOrganisationsRepository([
            partialMock(org)
          ]),
          reportsRepository: createInMemoryReportsRepository()
        },
        featureFlags: createInMemoryFeatureFlags()
      })

      const response = await server.inject({
        method: 'POST',
        url: makeUrl(org.id, registration.id),
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns 409 when report is in_progress', async () => {
      const registration = buildRegistration({
        wasteProcessingType: 'reprocessor',
        accreditationId: undefined
      })
      const org = buildOrganisationWithRegistration(
        /** @type {Registration} */ (registration)
      )

      const reportsRepositoryFactory = createInMemoryReportsRepository()
      const reportsRepository = reportsRepositoryFactory()
      await reportsRepository.createReport(
        buildCreateReportParams({
          organisationId: org.id,
          registrationId: registration.id
        })
      )

      const server = await createTestServer({
        repositories: {
          organisationsRepository: createInMemoryOrganisationsRepository([
            partialMock(org)
          ]),
          reportsRepository: reportsRepositoryFactory
        },
        featureFlags: createInMemoryFeatureFlags()
      })

      const response = await server.inject({
        method: 'POST',
        url: makeUrl(org.id, registration.id),
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    })

    it('returns 409 when a later submission already exists for the period', async () => {
      const registration = buildRegistration({
        wasteProcessingType: 'reprocessor',
        accreditationId: undefined
      })
      const org = buildOrganisationWithRegistration(
        /** @type {Registration} */ (registration)
      )

      const reportsRepositoryFactory = createInMemoryReportsRepository()
      const reportsRepository = reportsRepositoryFactory()

      const period = {
        organisationId: org.id,
        registrationId: registration.id,
        year: 2024,
        cadence: 'monthly',
        period: 1
      }
      await createAndSubmitReport(reportsRepository, {
        ...period,
        submissionNumber: 1
      })
      await createAndSubmitReport(reportsRepository, {
        ...period,
        submissionNumber: 2
      })

      const server = await createTestServer({
        repositories: {
          organisationsRepository: createInMemoryOrganisationsRepository([
            partialMock(org)
          ]),
          reportsRepository: reportsRepositoryFactory
        },
        featureFlags: createInMemoryFeatureFlags()
      })

      const response = await server.inject({
        method: 'POST',
        url: makeUrl(org.id, registration.id, 2024, 'monthly', 1, 1),
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    })

    it('returns 409 when a draft above the submission makes it no longer the latest', async () => {
      const registration = buildRegistration({
        wasteProcessingType: 'reprocessor',
        accreditationId: undefined
      })
      const org = buildOrganisationWithRegistration(
        /** @type {Registration} */ (registration)
      )

      const reportsRepositoryFactory = createInMemoryReportsRepository()
      const reportsRepository = reportsRepositoryFactory()

      const period = {
        organisationId: org.id,
        registrationId: registration.id,
        year: 2024,
        cadence: 'monthly',
        period: 1
      }
      await createAndSubmitReport(reportsRepository, {
        ...period,
        submissionNumber: 1
      })
      await reportsRepository.createReport(
        buildCreateReportParams({ ...period, submissionNumber: 2 })
      )

      const server = await createTestServer({
        repositories: {
          organisationsRepository: createInMemoryOrganisationsRepository([
            partialMock(org)
          ]),
          reportsRepository: reportsRepositoryFactory
        },
        featureFlags: createInMemoryFeatureFlags()
      })

      const response = await server.inject({
        method: 'POST',
        url: makeUrl(org.id, registration.id, 2024, 'monthly', 1, 1),
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    })
  })

  describe('feature flag disabled', () => {
    it('returns 409 when closedPeriodAdjustments is disabled', async () => {
      config.set(CLOSED_PERIOD_ADJUSTMENTS, false)
      const { server, organisationId, registrationId } =
        await buildServerWithSubmittedReport()

      const response = await server.inject({
        method: 'POST',
        url: makeUrl(organisationId, registrationId),
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    })
  })

  describe('service maintainer access', () => {
    it('returns 403 for a service maintainer (organisationWrite is operator-only, unlike unsubmit)', async () => {
      const { server, organisationId, registrationId } =
        await buildServerWithSubmittedReport()

      const response = await server.inject({
        method: 'POST',
        url: makeUrl(organisationId, registrationId),
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
  })
})
