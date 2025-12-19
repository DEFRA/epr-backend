import { StatusCodes } from 'http-status-codes'
import { ObjectId } from 'mongodb'
import {
  SUMMARY_LOG_STATUS,
  calculateExpiresAt
} from '#domain/summary-logs/status.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { waitForVersion } from '#repositories/summary-logs/contract/test-helpers.js'
import { createTestServer } from '#test/create-test-server.js'
import { asStandardUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'

describe('GET /v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/{summaryLogId}', () => {
  setupAuthContext()

  const organisationId = new ObjectId().toString()
  const registrationId = new ObjectId().toString()
  const summaryLogId = new ObjectId().toString()

  const createServer = async () => {
    const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
    const summaryLogsRepository = summaryLogsRepositoryFactory({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    })

    const server = await createTestServer({
      repositories: {
        summaryLogsRepository: summaryLogsRepositoryFactory
      },
      featureFlags: createInMemoryFeatureFlags({ summaryLogs: true })
    })

    return { server, summaryLogsRepository }
  }

  const insertSummaryLog = async (repository, data) => {
    const status = data.status ?? SUMMARY_LOG_STATUS.PREPROCESSING
    await repository.insert(summaryLogId, {
      organisationId,
      registrationId,
      file: {
        id: 'test-file-id',
        name: 'test-file.xlsx',
        status: 'complete',
        uri: 's3://test-bucket/test-file.xlsx'
      },
      ...data,
      status,
      expiresAt: calculateExpiresAt(status)
    })
  }

  const makeRequest = (server) =>
    server.inject({
      method: 'GET',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}`,
      ...asStandardUser({ linkedOrgId: organisationId })
    })

  describe('when summary log does not exist', () => {
    it('returns OK with default preprocessing status', async () => {
      const { server } = await createServer()

      const response = await makeRequest(server)

      expect(response.statusCode).toBe(StatusCodes.OK)
      const payload = JSON.parse(response.payload)
      expect(payload.status).toBe(SUMMARY_LOG_STATUS.PREPROCESSING)
    })
  })

  describe('status in response', () => {
    it('returns the summary log status', async () => {
      const { server, summaryLogsRepository } = await createServer()
      await insertSummaryLog(summaryLogsRepository, {
        status: SUMMARY_LOG_STATUS.VALIDATED
      })

      const response = await makeRequest(server)

      expect(response.statusCode).toBe(StatusCodes.OK)
      const payload = JSON.parse(response.payload)
      expect(payload.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
    })
  })

  describe('loads in response', () => {
    const createLoads = () => ({
      added: {
        valid: { count: 5, rowIds: ['1', '2', '3', '4', '5'] },
        invalid: { count: 0, rowIds: [] },
        included: { count: 5, rowIds: ['1', '2', '3', '4', '5'] },
        excluded: { count: 0, rowIds: [] }
      },
      adjusted: {
        valid: { count: 2, rowIds: ['6', '7'] },
        invalid: { count: 1, rowIds: ['8'] },
        included: { count: 2, rowIds: ['6', '7'] },
        excluded: { count: 1, rowIds: ['8'] }
      },
      unchanged: {
        valid: { count: 10, rowIds: [] },
        invalid: { count: 0, rowIds: [] },
        included: { count: 10, rowIds: [] },
        excluded: { count: 0, rowIds: [] }
      }
    })

    it('includes loads when present', async () => {
      const { server, summaryLogsRepository } = await createServer()
      const loads = createLoads()
      await insertSummaryLog(summaryLogsRepository, {
        status: SUMMARY_LOG_STATUS.VALIDATED
      })
      await summaryLogsRepository.update(summaryLogId, 1, { loads })
      await waitForVersion(summaryLogsRepository, summaryLogId, 2)

      const response = await makeRequest(server)

      expect(response.statusCode).toBe(StatusCodes.OK)
      const payload = JSON.parse(response.payload)
      expect(payload.loads).toEqual(loads)
    })

    it('does not include loads when absent', async () => {
      const { server, summaryLogsRepository } = await createServer()
      await insertSummaryLog(summaryLogsRepository, {
        status: SUMMARY_LOG_STATUS.VALIDATED
      })

      const response = await makeRequest(server)

      expect(response.statusCode).toBe(StatusCodes.OK)
      const payload = JSON.parse(response.payload)
      expect(payload).not.toHaveProperty('loads')
    })
  })

  describe('meta fields in response', () => {
    it('includes processingType and material when meta exists', async () => {
      const { server, summaryLogsRepository } = await createServer()
      await insertSummaryLog(summaryLogsRepository, {
        status: SUMMARY_LOG_STATUS.VALIDATED
      })
      await summaryLogsRepository.update(summaryLogId, 1, {
        meta: {
          PROCESSING_TYPE: 'REPROCESSOR_INPUT',
          MATERIAL: 'Paper_and_board'
        }
      })
      await waitForVersion(summaryLogsRepository, summaryLogId, 2)

      const response = await makeRequest(server)

      expect(response.statusCode).toBe(StatusCodes.OK)
      const payload = JSON.parse(response.payload)
      expect(payload.processingType).toBe('REPROCESSOR_INPUT')
      expect(payload.material).toBe('Paper_and_board')
    })

    it('includes accreditationNumber when present in meta', async () => {
      const { server, summaryLogsRepository } = await createServer()
      await insertSummaryLog(summaryLogsRepository, {
        status: SUMMARY_LOG_STATUS.VALIDATED
      })
      await summaryLogsRepository.update(summaryLogId, 1, {
        meta: {
          PROCESSING_TYPE: 'EXPORTER',
          MATERIAL: 'Aluminium',
          ACCREDITATION_NUMBER: '87654321'
        }
      })
      await waitForVersion(summaryLogsRepository, summaryLogId, 2)

      const response = await makeRequest(server)

      expect(response.statusCode).toBe(StatusCodes.OK)
      const payload = JSON.parse(response.payload)
      expect(payload.accreditationNumber).toBe('87654321')
    })

    it('does not include accreditationNumber when missing from meta', async () => {
      const { server, summaryLogsRepository } = await createServer()
      await insertSummaryLog(summaryLogsRepository, {
        status: SUMMARY_LOG_STATUS.VALIDATED
      })
      await summaryLogsRepository.update(summaryLogId, 1, {
        meta: {
          PROCESSING_TYPE: 'REPROCESSOR_OUTPUT',
          MATERIAL: 'Glass'
        }
      })
      await waitForVersion(summaryLogsRepository, summaryLogId, 2)

      const response = await makeRequest(server)

      expect(response.statusCode).toBe(StatusCodes.OK)
      const payload = JSON.parse(response.payload)
      expect(payload).not.toHaveProperty('accreditationNumber')
    })

    it('does not include meta fields when meta is absent', async () => {
      const { server, summaryLogsRepository } = await createServer()
      await insertSummaryLog(summaryLogsRepository, {
        status: SUMMARY_LOG_STATUS.PREPROCESSING
      })

      const response = await makeRequest(server)

      expect(response.statusCode).toBe(StatusCodes.OK)
      const payload = JSON.parse(response.payload)
      expect(payload).not.toHaveProperty('processingType')
      expect(payload).not.toHaveProperty('material')
      expect(payload).not.toHaveProperty('accreditationNumber')
    })

    it('omits null meta values from response', async () => {
      const { server, summaryLogsRepository } = await createServer()
      await insertSummaryLog(summaryLogsRepository, {
        status: SUMMARY_LOG_STATUS.INVALID
      })
      await summaryLogsRepository.update(summaryLogId, 1, {
        meta: {
          PROCESSING_TYPE: null,
          MATERIAL: null,
          ACCREDITATION_NUMBER: null
        }
      })
      await waitForVersion(summaryLogsRepository, summaryLogId, 2)

      const response = await makeRequest(server)

      expect(response.statusCode).toBe(StatusCodes.OK)
      const payload = JSON.parse(response.payload)
      expect(payload).not.toHaveProperty('processingType')
      expect(payload).not.toHaveProperty('material')
      expect(payload).not.toHaveProperty('accreditationNumber')
    })
  })
})
