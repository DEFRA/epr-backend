import { ObjectId } from 'mongodb'
import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { asStandardUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import {
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { buildCreateReportParams } from '#reports/repository/contract/test-data.js'
import { reportsStatusPath } from './status.js'

describe(`POST ${reportsStatusPath}`, () => {
  setupAuthContext()

  const makeUrl = (orgId, regId, year, cadence, period) =>
    `/v1/organisations/${orgId}/registrations/${regId}/reports/${year}/${cadence}/${period}/status`

  describe('when feature flag is enabled', () => {
    const createServerWithReport = async (registrationOverrides = {}) => {
      const registration = buildRegistration(registrationOverrides)
      const org = buildOrganisation({ registrations: [registration] })

      const organisationsRepositoryFactory =
        createInMemoryOrganisationsRepository()
      const organisationsRepository = organisationsRepositoryFactory()
      await organisationsRepository.insert(org)

      const reportsRepositoryFactory = createInMemoryReportsRepository()
      const reportsRepository = reportsRepositoryFactory()

      const createdReport = await reportsRepository.createReport(
        buildCreateReportParams({
          organisationId: org.id,
          registrationId: registration.id,
          year: 2025,
          cadence: 'quarterly',
          period: 1,
          startDate: '2025-01-01',
          endDate: '2025-03-31',
          dueDate: '2025-04-20'
        })
      )

      const server = await createTestServer({
        repositories: {
          organisationsRepository: organisationsRepositoryFactory,
          wasteRecordsRepository: createInMemoryWasteRecordsRepository([]),
          reportsRepository: reportsRepositoryFactory
        },
        featureFlags: createInMemoryFeatureFlags({ reports: true })
      })

      return {
        server,
        organisationId: org.id,
        registrationId: registration.id,
        reportId: createdReport.id,
        reportsRepository
      }
    }

    const createServerWithoutReport = async (registrationOverrides = {}) => {
      const registration = buildRegistration(registrationOverrides)
      const org = buildOrganisation({ registrations: [registration] })

      const organisationsRepositoryFactory =
        createInMemoryOrganisationsRepository()
      const organisationsRepository = organisationsRepositoryFactory()
      await organisationsRepository.insert(org)

      const server = await createTestServer({
        repositories: {
          organisationsRepository: organisationsRepositoryFactory,
          wasteRecordsRepository: createInMemoryWasteRecordsRepository([]),
          reportsRepository: createInMemoryReportsRepository()
        },
        featureFlags: createInMemoryFeatureFlags({ reports: true })
      })

      return {
        server,
        organisationId: org.id,
        registrationId: registration.id
      }
    }

    const postStatus = (
      server,
      orgId,
      regId,
      payload,
      year = 2025,
      cadence = 'quarterly',
      period = 1
    ) =>
      server.inject({
        method: 'POST',
        url: makeUrl(orgId, regId, year, cadence, period),
        payload,
        ...asStandardUser({ linkedOrgId: orgId })
      })

    describe('successful transitions', () => {
      it('advances status to ready_to_submit', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReport({
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          })

        const response = await postStatus(
          server,
          organisationId,
          registrationId,
          { status: 'ready_to_submit', version: 1 }
        )

        expect(response.statusCode).toBe(StatusCodes.OK)
        const payload = JSON.parse(response.payload)
        expect(payload.status).toBe('ready_to_submit')
      })

      it('increments report version', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReport({
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          })

        const response = await postStatus(
          server,
          organisationId,
          registrationId,
          { status: 'ready_to_submit', version: 1 }
        )

        const payload = JSON.parse(response.payload)
        expect(payload.version).toBe(2)
      })

      it('appends to status history', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReport({
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          })

        const response = await postStatus(
          server,
          organisationId,
          registrationId,
          { status: 'ready_to_submit', version: 1 }
        )

        const payload = JSON.parse(response.payload)
        expect(payload.statusHistory).toHaveLength(2)
        expect(payload.statusHistory[0].status).toBe('in_progress')
        expect(payload.statusHistory[1].status).toBe('ready_to_submit')
      })
    })

    describe('optimistic locking', () => {
      it('returns 409 when version does not match', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReport({
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          })

        const response = await postStatus(
          server,
          organisationId,
          registrationId,
          { status: 'ready_to_submit', version: 99 }
        )

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      })
    })

    describe('transition guards', () => {
      it('returns 400 for invalid transition from in_progress to submitted', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReport({
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          })

        const response = await postStatus(
          server,
          organisationId,
          registrationId,
          { status: 'submitted', version: 1 }
        )

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      })
    })

    describe('error handling', () => {
      it('returns 404 when no report exists for period', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithoutReport({
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          })

        const response = await postStatus(
          server,
          organisationId,
          registrationId,
          { status: 'ready_to_submit', version: 1 }
        )

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })

      it('returns 422 for invalid status value', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReport({
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          })

        const response = await postStatus(
          server,
          organisationId,
          registrationId,
          { status: 'banana', version: 1 }
        )

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 when version is missing', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReport({
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          })

        const response = await postStatus(
          server,
          organisationId,
          registrationId,
          { status: 'ready_to_submit' }
        )

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 when payload is empty', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithoutReport({
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          })

        const response = await postStatus(
          server,
          organisationId,
          registrationId,
          {}
        )

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 for invalid cadence', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithoutReport({
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          })

        const response = await server.inject({
          method: 'POST',
          url: makeUrl(organisationId, registrationId, 2025, 'biweekly', 1),
          payload: { status: 'ready_to_submit', version: 1 },
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })
    })
  })

  describe('when feature flag is disabled', () => {
    it('returns 404', async () => {
      const organisationId = new ObjectId().toString()
      const registrationId = new ObjectId().toString()

      const server = await createTestServer({
        repositories: {},
        featureFlags: createInMemoryFeatureFlags({ reports: false })
      })

      const response = await server.inject({
        method: 'POST',
        url: makeUrl(organisationId, registrationId, 2025, 'quarterly', 1),
        payload: { status: 'ready_to_submit', version: 1 },
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })
})
