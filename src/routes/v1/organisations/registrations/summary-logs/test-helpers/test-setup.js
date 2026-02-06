import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { createInMemorySummaryLogExtractor } from '#application/summary-logs/extractor-inmemory.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS,
  transitionStatus
} from '#domain/summary-logs/status.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
// eslint-disable-next-line n/no-unpublished-import
import { createTestServer } from '#test/create-test-server.js'
// eslint-disable-next-line n/no-unpublished-import
import { asStandardUser } from '#test/inject-auth.js'

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

const POLL_INTERVAL_MS = 50
const DEFAULT_MAX_ATTEMPTS = 20

/**
 * @typedef {object} PollOptions
 * @property {string} [waitWhile] Status to wait while (defaults to VALIDATING)
 * @property {number} [maxAttempts] Maximum poll attempts (defaults to 20)
 */

/**
 * Poll until summary log status changes from the specified status.
 * @param {object} server - Test server instance
 * @param {string} organisationId - Organisation ID
 * @param {string} registrationId - Registration ID
 * @param {string} summaryLogId - Summary log ID
 * @param {PollOptions} [options] - Polling options
 * @returns {Promise<string>} Final status after polling
 */
export const pollWhileStatus = async (
  server,
  organisationId,
  registrationId,
  summaryLogId,
  {
    waitWhile = SUMMARY_LOG_STATUS.VALIDATING,
    maxAttempts = DEFAULT_MAX_ATTEMPTS
  } = {}
) => {
  let attempts = 0
  let status = waitWhile

  while (status === waitWhile && attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))

    const checkResponse = await server.inject({
      method: 'GET',
      url: buildGetUrl(organisationId, registrationId, summaryLogId),
      ...asStandardUser({ linkedOrgId: organisationId })
    })

    status = JSON.parse(checkResponse.payload).status
    attempts++
  }

  return status
}

export const pollForValidation = (
  server,
  organisationId,
  registrationId,
  summaryLogId
) =>
  pollWhileStatus(server, organisationId, registrationId, summaryLogId, {
    waitWhile: SUMMARY_LOG_STATUS.VALIDATING
  })

export const createTestInfrastructure = async (
  organisationId,
  registrationId,
  extractorData,
  { reprocessingType = 'input' } = {}
) => {
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn()
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
        reprocessingType,
        formSubmissionTime: new Date(),
        submittedToRegulator: 'ea',
        validFrom: '2025-01-01',
        validTo: '2025-12-31',
        accreditation: {
          accreditationNumber: 'ACC-123'
        }
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

export const createSummaryLogSubmitterWorker = ({
  validate,
  summaryLogsRepository,
  syncWasteRecords
}) => ({
  validate,
  submit: async (summaryLogId) => {
    await new Promise((resolve) => setImmediate(resolve))

    const existing = await summaryLogsRepository.findById(summaryLogId)
    const { version, summaryLog } = existing

    await syncWasteRecords(summaryLog)

    await summaryLogsRepository.update(
      summaryLogId,
      version,
      transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUBMITTED)
    )
  }
})
