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
import { reportsPostPath } from './post.js'

describe(`POST ${reportsPostPath}`, () => {
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

      const wasteRecordsRepositoryFactory =
        createInMemoryWasteRecordsRepository([])
      const reportsRepositoryFactory = createInMemoryReportsRepository()

      const server = await createTestServer({
        repositories: {
          organisationsRepository: organisationsRepositoryFactory,
          wasteRecordsRepository: wasteRecordsRepositoryFactory,
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

    const makeRequest = (
      server,
      orgId,
      regId,
      year = 2025,
      cadence = 'quarterly',
      period = 1
    ) =>
      server.inject({
        method: 'POST',
        url: makeUrl(orgId, regId, year, cadence, period),
        ...asStandardUser({ linkedOrgId: orgId })
      })

    it('returns 201 with created report', async () => {
      const { server, organisationId, registrationId } = await createServer({
        wasteProcessingType: 'reprocessor',
        accreditationId: undefined
      })

      const response = await makeRequest(server, organisationId, registrationId)

      expect(response.statusCode).toBe(StatusCodes.CREATED)
      const payload = JSON.parse(response.payload)
      expect(payload.id).toBeDefined()
      expect(payload.status).toBe('in_progress')
      expect(payload.details).toBeDefined()
    })

    it('returns 409 when report already exists', async () => {
      const { server, organisationId, registrationId } = await createServer({
        wasteProcessingType: 'reprocessor',
        accreditationId: undefined
      })

      await makeRequest(server, organisationId, registrationId)
      const response = await makeRequest(server, organisationId, registrationId)

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    })

    it('returns 400 when period has not yet ended', async () => {
      const { server, organisationId, registrationId } = await createServer({
        wasteProcessingType: 'reprocessor',
        accreditationId: undefined
      })

      const response = await makeRequest(
        server,
        organisationId,
        registrationId,
        2099,
        'quarterly',
        1
      )

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
    })

    it('returns 404 when registration not found', async () => {
      const { server, organisationId } = await createServer()
      const unknownRegId = new ObjectId().toString()

      const response = await makeRequest(server, organisationId, unknownRegId)

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('creates report for non-glass material registration', async () => {
      const { server, organisationId, registrationId } = await createServer({
        wasteProcessingType: 'exporter',
        accreditationId: undefined
      })

      const response = await makeRequest(
        server,
        organisationId,
        registrationId,
        2025,
        'quarterly',
        1
      )

      expect(response.statusCode).toBe(StatusCodes.CREATED)
      const payload = JSON.parse(response.payload)
      expect(payload.material).toBe('plastic')
    })

    it('returns 400 for invalid period number for cadence', async () => {
      const { server, organisationId, registrationId } = await createServer({
        wasteProcessingType: 'reprocessor',
        accreditationId: undefined
      })

      const response = await makeRequest(
        server,
        organisationId,
        registrationId,
        2025,
        'quarterly',
        5
      )

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
    })

    it('returns 422 for invalid cadence', async () => {
      const { server, organisationId, registrationId } = await createServer({
        wasteProcessingType: 'reprocessor',
        accreditationId: undefined
      })

      const response = await server.inject({
        method: 'POST',
        url: makeUrl(organisationId, registrationId, 2025, 'biweekly', 1),
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
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
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })
})
