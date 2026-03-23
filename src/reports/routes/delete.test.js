import { ObjectId } from 'mongodb'
import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { asStandardUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import {
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { reportsDeletePath } from './delete.js'

describe(`DELETE ${reportsDeletePath}`, () => {
  setupAuthContext()

  const makeUrl = (orgId, regId, year, cadence, period) =>
    `/v1/organisations/${orgId}/registrations/${regId}/reports/${year}/${cadence}/${period}`

  describe('when feature flag is enabled', () => {
    const createServer = async (registrationOverrides = {}) => {
      const registration = buildRegistration(registrationOverrides)
      const org = buildOrganisation({ registrations: [registration] })

      const organisationsRepositoryFactory =
        createInMemoryOrganisationsRepository()
      const organisationsRepository = organisationsRepositoryFactory()
      await organisationsRepository.insert(org)

      const reportsRepositoryFactory = createInMemoryReportsRepository()

      const server = await createTestServer({
        repositories: {
          organisationsRepository: organisationsRepositoryFactory,
          reportsRepository: reportsRepositoryFactory
        },
        featureFlags: createInMemoryFeatureFlags({ reports: true })
      })

      return {
        server,
        organisationId: org.id,
        registrationId: registration.id,
        reportsRepositoryFactory
      }
    }

    const makeDeleteRequest = (
      server,
      orgId,
      regId,
      year = 2026,
      cadence = 'quarterly',
      period = 1
    ) =>
      server.inject({
        method: 'DELETE',
        url: makeUrl(orgId, regId, year, cadence, period),
        ...asStandardUser({ linkedOrgId: orgId })
      })

    it('returns 204 when report is deleted', async () => {
      const {
        server,
        organisationId,
        registrationId,
        reportsRepositoryFactory
      } = await createServer({
        wasteProcessingType: 'reprocessor',
        accreditationId: undefined
      })

      const reportsRepository = reportsRepositoryFactory()
      await reportsRepository.createReport({
        organisationId,
        registrationId,
        year: 2026,
        cadence: 'quarterly',
        period: 1,
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        dueDate: '2026-04-20',
        changedBy: { id: 'user-1', name: 'Test', position: 'Officer' },
        material: 'plastic',
        wasteProcessingType: 'reprocessor'
      })

      const response = await makeDeleteRequest(
        server,
        organisationId,
        registrationId
      )

      expect(response.statusCode).toBe(StatusCodes.NO_CONTENT)
    })

    it('returns 404 when no report exists for period', async () => {
      const { server, organisationId, registrationId } = await createServer({
        wasteProcessingType: 'reprocessor',
        accreditationId: undefined
      })

      const response = await makeDeleteRequest(
        server,
        organisationId,
        registrationId
      )

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns 404 when registration not found', async () => {
      const { server, organisationId } = await createServer()
      const unknownRegId = new ObjectId().toString()

      const response = await makeDeleteRequest(
        server,
        organisationId,
        unknownRegId
      )

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
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
        method: 'DELETE',
        url: makeUrl(organisationId, registrationId, 2026, 'quarterly', 1),
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })
})
