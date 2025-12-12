import { StatusCodes } from 'http-status-codes'
import { ObjectId } from 'mongodb'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import {
  buildOrganisation,
  buildRegistration,
  buildAccreditation
} from '#repositories/organisations/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { asStandardUser, asServiceMaintainer } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'

describe('GET /v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/{summaryLogId}', () => {
  setupAuthContext()

  const organisationId = new ObjectId().toString()
  const registrationId = new ObjectId().toString()
  const summaryLogId = new ObjectId().toString()

  const createServerWithData = async (organisationData) => {
    const organisationsRepositoryFactory =
      createInMemoryOrganisationsRepository([organisationData])

    const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
    const summaryLogsRepository = summaryLogsRepositoryFactory({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    })

    const server = await createTestServer({
      repositories: {
        summaryLogsRepository: summaryLogsRepositoryFactory,
        organisationsRepository: organisationsRepositoryFactory
      },
      featureFlags: createInMemoryFeatureFlags({ summaryLogs: true })
    })

    await summaryLogsRepository.insert(summaryLogId, {
      status: SUMMARY_LOG_STATUS.SUBMITTED,
      organisationId,
      registrationId,
      file: {
        id: 'test-file-id',
        name: 'test-file.xlsx',
        status: 'complete',
        uri: 's3://test-bucket/test-file.xlsx'
      }
    })

    return server
  }

  describe('authorisation', () => {
    it('returns 401 when request has no authentication', async () => {
      const organisation = buildOrganisation({
        id: organisationId,
        registrations: [buildRegistration({ id: registrationId })]
      })

      const server = await createServerWithData(organisation)

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}`
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 when user has wrong scope', async () => {
      const organisation = buildOrganisation({
        id: organisationId,
        registrations: [buildRegistration({ id: registrationId })]
      })

      const server = await createServerWithData(organisation)

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}`,
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
  })

  describe('accreditation number in response', () => {
    it('is included when registration has valid accreditation', async () => {
      const accreditation = buildAccreditation({
        accreditationNumber: '87654321'
      })

      const registration = buildRegistration({
        id: registrationId,
        accreditationId: accreditation.id
      })

      const organisation = buildOrganisation({
        id: organisationId,
        registrations: [registration],
        accreditations: [accreditation]
      })

      const server = await createServerWithData(organisation)

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}`,
        ...asStandardUser()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const payload = JSON.parse(response.payload)
      expect(payload.status).toBe(SUMMARY_LOG_STATUS.SUBMITTED)
      expect(payload.accreditationNumber).toBe('87654321')
    })

    it('is null when registration is not linked to an accreditation', async () => {
      const registration = buildRegistration({
        id: registrationId
      })
      delete registration.accreditationId

      const organisation = buildOrganisation({
        id: organisationId,
        registrations: [registration],
        accreditations: []
      })

      const server = await createServerWithData(organisation)

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}`,
        ...asStandardUser()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const payload = JSON.parse(response.payload)
      expect(payload.accreditationNumber).toBeNull()
    })

    it('is null when linked accreditation exists but has no number', async () => {
      const accreditation = buildAccreditation()
      delete accreditation.accreditationNumber

      const registration = buildRegistration({
        id: registrationId,
        accreditationId: accreditation.id
      })

      const organisation = buildOrganisation({
        id: organisationId,
        registrations: [registration],
        accreditations: [accreditation]
      })

      const server = await createServerWithData(organisation)

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}`,
        ...asStandardUser()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const payload = JSON.parse(response.payload)
      expect(payload.accreditationNumber).toBeNull()
    })
  })
})
