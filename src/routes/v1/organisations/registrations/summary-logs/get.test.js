import { StatusCodes } from 'http-status-codes'
import { ObjectId } from 'mongodb'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { asStandardUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'

describe('GET /v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/{summaryLogId}', () => {
  setupAuthContext()

  const organisationId = new ObjectId().toString()
  const registrationId = new ObjectId().toString()
  const summaryLogId = new ObjectId().toString()

  const createServerWithSummaryLog = async (summaryLogData) => {
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

    await summaryLogsRepository.insert(summaryLogId, {
      organisationId,
      registrationId,
      file: {
        id: 'test-file-id',
        name: 'test-file.xlsx',
        status: 'complete',
        uri: 's3://test-bucket/test-file.xlsx'
      },
      ...summaryLogData
    })

    return server
  }

  const makeRequest = (server) =>
    server.inject({
      method: 'GET',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}`,
      ...asStandardUser({ linkedOrgId: organisationId })
    })

  describe('meta fields in response', () => {
    it('includes processingType and material when meta exists', async () => {
      const server = await createServerWithSummaryLog({
        status: SUMMARY_LOG_STATUS.VALIDATED,
        meta: {
          PROCESSING_TYPE: 'REPROCESSOR_INPUT',
          MATERIAL: 'Paper_and_board'
        }
      })

      const response = await makeRequest(server)

      expect(response.statusCode).toBe(StatusCodes.OK)
      const payload = JSON.parse(response.payload)
      expect(payload.processingType).toBe('REPROCESSOR_INPUT')
      expect(payload.material).toBe('Paper_and_board')
    })

    it('includes accreditationNumber when present in meta', async () => {
      const server = await createServerWithSummaryLog({
        status: SUMMARY_LOG_STATUS.VALIDATED,
        meta: {
          PROCESSING_TYPE: 'EXPORTER',
          MATERIAL: 'Aluminium',
          ACCREDITATION_NUMBER: '87654321'
        }
      })

      const response = await makeRequest(server)

      expect(response.statusCode).toBe(StatusCodes.OK)
      const payload = JSON.parse(response.payload)
      expect(payload.accreditationNumber).toBe('87654321')
    })

    it('does not include accreditationNumber when missing from meta', async () => {
      const server = await createServerWithSummaryLog({
        status: SUMMARY_LOG_STATUS.VALIDATED,
        meta: {
          PROCESSING_TYPE: 'REPROCESSOR_OUTPUT',
          MATERIAL: 'Glass'
        }
      })

      const response = await makeRequest(server)

      expect(response.statusCode).toBe(StatusCodes.OK)
      const payload = JSON.parse(response.payload)
      expect(payload).not.toHaveProperty('accreditationNumber')
    })

    it('does not include meta fields when meta is absent', async () => {
      const server = await createServerWithSummaryLog({
        status: SUMMARY_LOG_STATUS.PREPROCESSING
      })

      const response = await makeRequest(server)

      expect(response.statusCode).toBe(StatusCodes.OK)
      const payload = JSON.parse(response.payload)
      expect(payload).not.toHaveProperty('processingType')
      expect(payload).not.toHaveProperty('material')
      expect(payload).not.toHaveProperty('accreditationNumber')
    })
  })
})
