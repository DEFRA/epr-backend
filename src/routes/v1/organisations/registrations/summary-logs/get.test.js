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
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'

describe('GET /v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/{summaryLogId}', () => {
  setupAuthContext()
  let server
  let summaryLogsRepository

  const organisationId = new ObjectId().toString()
  const registrationId = new ObjectId().toString()
  const summaryLogId = new ObjectId().toString()

  describe('when status is SUBMITTED', () => {
    it('returns accreditation number from linked registration', async () => {
      // Arrange
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

      const organisationsRepositoryFactory =
        createInMemoryOrganisationsRepository([organisation])

      const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
      summaryLogsRepository = summaryLogsRepositoryFactory({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
      })

      // Create server with both repositories
      server = await createTestServer({
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

      // Act
      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}`
      })

      // Assert
      expect(response.statusCode).toBe(StatusCodes.OK)
      const payload = JSON.parse(response.payload)
      expect(payload.status).toBe(SUMMARY_LOG_STATUS.SUBMITTED)
      expect(payload.accreditationNumber).toBe('87654321')
    })

    it('returns null when registration not found', async () => {
      // Arrange - organisation exists but doesn't have this specific registration
      const organisation = buildOrganisation({
        id: organisationId,
        registrations: [],
        accreditations: []
      })

      const organisationsRepositoryFactory =
        createInMemoryOrganisationsRepository([organisation])

      const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
      summaryLogsRepository = summaryLogsRepositoryFactory({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
      })

      server = await createTestServer({
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

      // Act
      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}`
      })

      // Assert
      expect(response.statusCode).toBe(StatusCodes.OK)
      const payload = JSON.parse(response.payload)
      expect(payload.accreditationNumber).toBeNull()
    })

    it('returns null when registration has no accreditation', async () => {
      // Arrange
      const registration = buildRegistration({
        id: registrationId
      })
      delete registration.accreditationId

      const organisation = buildOrganisation({
        id: organisationId,
        registrations: [registration],
        accreditations: []
      })

      const organisationsRepositoryFactory =
        createInMemoryOrganisationsRepository([organisation])

      const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
      summaryLogsRepository = summaryLogsRepositoryFactory({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
      })

      server = await createTestServer({
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

      // Act
      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}`
      })

      // Assert
      expect(response.statusCode).toBe(StatusCodes.OK)
      const payload = JSON.parse(response.payload)
      expect(payload.accreditationNumber).toBeNull()
    })

    it('returns null when accreditation has no number', async () => {
      // Arrange
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

      const organisationsRepositoryFactory =
        createInMemoryOrganisationsRepository([organisation])

      const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
      summaryLogsRepository = summaryLogsRepositoryFactory({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
      })

      server = await createTestServer({
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

      // Act
      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}`
      })

      // Assert
      expect(response.statusCode).toBe(StatusCodes.OK)
      const payload = JSON.parse(response.payload)
      expect(payload.accreditationNumber).toBeNull()
    })
  })
})
