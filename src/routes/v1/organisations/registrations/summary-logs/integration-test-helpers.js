import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
// eslint-disable-next-line n/no-unpublished-import
import { createTestServer } from '#test/create-test-server.js'
import { createInMemorySummaryLogExtractor } from '#application/summary-logs/extractor-inmemory.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'

export const { validToken } = entraIdMockAuthTokens

export const createUploadPayload = (
  organisationId,
  registrationId,
  fileStatus,
  fileId,
  filename,
  includeS3 = true
) => ({
  uploadStatus: 'ready',
  metadata: {
    organisationId,
    registrationId
  },
  form: {
    summaryLogUpload: {
      fileId,
      filename,
      fileStatus,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      contentLength: 12345,
      checksumSha256: 'abc123def456',
      detectedContentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ...(includeS3 && {
        s3Bucket: 'test-bucket',
        s3Key: `path/to/${filename}`
      })
    }
  },
  numberOfRejectedFiles: fileStatus === UPLOAD_STATUS.REJECTED ? 1 : 0
})

export const buildGetUrl = (organisationId, registrationId, summaryLogId) =>
  `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}`

export const buildPostUrl = (organisationId, registrationId, summaryLogId) =>
  `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`

export const buildSubmitUrl = (organisationId, registrationId, summaryLogId) =>
  `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`

export const pollForValidation = async (
  server,
  organisationId,
  registrationId,
  summaryLogId
) => {
  let attempts = 0
  const maxAttempts = 10
  let status = SUMMARY_LOG_STATUS.VALIDATING

  while (status === SUMMARY_LOG_STATUS.VALIDATING && attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 50))

    const checkResponse = await server.inject({
      method: 'GET',
      url: buildGetUrl(organisationId, registrationId, summaryLogId),
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    status = JSON.parse(checkResponse.payload).status
    attempts++
  }
}

export const createStandardMeta = (processingType) => ({
  REGISTRATION_NUMBER: {
    value: 'REG-123',
    location: { sheet: 'Cover', row: 1, column: 'B' }
  },
  PROCESSING_TYPE: {
    value: processingType,
    location: { sheet: 'Cover', row: 2, column: 'B' }
  },
  MATERIAL: {
    value: 'Paper_and_board',
    location: { sheet: 'Cover', row: 3, column: 'B' }
  },
  TEMPLATE_VERSION: {
    value: 1,
    location: { sheet: 'Cover', row: 4, column: 'B' }
  }
})

export const createTestInfrastructure = async (
  organisationId,
  registrationId,
  extractorData
) => {
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }

  const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
  const uploadsRepository = createInMemoryUploadsRepository()
  const summaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)

  const testOrg = buildOrganisation({
    registrations: [
      {
        id: registrationId,
        registrationNumber: 'REG-123',
        material: 'paper',
        wasteProcessingType: 'reprocessor',
        formSubmissionTime: new Date(),
        submittedToRegulator: 'ea'
      }
    ]
  })
  testOrg.id = organisationId

  const organisationsRepository = createInMemoryOrganisationsRepository([
    testOrg
  ])()
  const summaryLogExtractor = createInMemorySummaryLogExtractor(extractorData)
  const wasteRecordsRepository = createInMemoryWasteRecordsRepository()()

  const validateSummaryLog = createSummaryLogsValidator({
    summaryLogsRepository,
    organisationsRepository,
    wasteRecordsRepository,
    summaryLogExtractor
  })

  const featureFlags = createInMemoryFeatureFlags({ summaryLogs: true })

  const server = await createTestServer({
    repositories: {
      summaryLogsRepository: summaryLogsRepositoryFactory,
      uploadsRepository
    },
    workers: {
      summaryLogsWorker: { validate: validateSummaryLog }
    },
    featureFlags
  })

  return { server, summaryLogsRepository }
}
