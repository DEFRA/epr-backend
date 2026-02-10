import { vi } from 'vitest'
import { ObjectId } from 'mongodb'
import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { createInMemorySummaryLogExtractor } from '#application/summary-logs/extractor-inmemory.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { syncFromSummaryLog } from '#application/waste-records/sync-from-summary-log.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS,
  transitionStatus
} from '#domain/summary-logs/status.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import {
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { createInMemoryWasteBalancesRepository } from '#repositories/waste-balances/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
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

const DEFAULT_VALID_FROM = '2025-01-01'
const DEFAULT_VALID_TO = '2025-12-31'
const DEFAULT_MATERIAL = 'paper'
const DEFAULT_WASTE_PROCESSING_TYPE = 'reprocessor'
const DEFAULT_REPROCESSING_TYPE = 'input'
const DEFAULT_REGULATOR = 'ea'
const DEFAULT_REGISTRATION_ID = 'REG-12345'
const DEFAULT_ACCREDITATION_ID = 'ACC-2025-001'
const DEFAULT_TEST_REG_NO = 'REG-123'
const DEFAULT_TEST_ACC_NO = 'ACC-123'

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
  /** @type {any} */ extractorData,
  { reprocessingType = DEFAULT_REPROCESSING_TYPE } = {}
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
        registrationNumber: DEFAULT_TEST_REG_NO,
        material: DEFAULT_MATERIAL,
        wasteProcessingType: DEFAULT_WASTE_PROCESSING_TYPE,
        reprocessingType,
        formSubmissionTime: new Date(),
        submittedToRegulator: DEFAULT_REGULATOR,
        validFrom: DEFAULT_VALID_FROM,
        validTo: DEFAULT_VALID_TO,
        accreditation: {
          accreditationNumber: DEFAULT_TEST_ACC_NO
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

const buildIntegrationOrganisation = ({
  organisationId,
  registrationId,
  accreditationId,
  registrationNumber,
  accreditationNumber,
  material,
  wasteProcessingType,
  reprocessingType
}) => {
  const testOrg = buildOrganisation({
    registrations: [
      buildRegistration({
        id: registrationId,
        registrationNumber,
        status: 'approved',
        material,
        wasteProcessingType,
        reprocessingType,
        formSubmissionTime: new Date(),
        submittedToRegulator: DEFAULT_REGULATOR,
        validFrom: DEFAULT_VALID_FROM,
        validTo: DEFAULT_VALID_TO,
        accreditationId
      })
    ],
    accreditations: accreditationId
      ? [
          {
            id: accreditationId,
            accreditationNumber,
            validFrom: DEFAULT_VALID_FROM,
            validTo: DEFAULT_VALID_TO
          }
        ]
      : []
  })
  testOrg.id = organisationId
  return testOrg
}

const buildIntegrationInfrastructure = async ({
  summaryLogsRepository,
  organisationsRepository,
  wasteRecordsRepository,
  extractorData,
  featureFlagsOverrides
}) => {
  const fileDataMap = { ...extractorData }
  const summaryLogExtractor = {
    extract: async (summaryLog) => {
      const fileId = summaryLog.file.id
      if (!fileDataMap[fileId]) {
        throw new Error(`No data found for file ${fileId}`)
      }
      return fileDataMap[fileId]
    }
  }

  const validateSummaryLog = createSummaryLogsValidator({
    summaryLogsRepository,
    organisationsRepository,
    wasteRecordsRepository,
    summaryLogExtractor
  })

  const featureFlags = createInMemoryFeatureFlags({
    summaryLogs: true,
    ...featureFlagsOverrides
  })

  return { summaryLogExtractor, validateSummaryLog, featureFlags, fileDataMap }
}

const createSummaryLogIntegrationServer = async ({
  summaryLogsRepositoryFactory,
  uploadsRepository,
  wasteRecordsRepositoryFactory,
  organisationsRepository,
  wasteBalancesRepositoryFactory,
  extraRepositories,
  submitterWorker,
  extraWorkers,
  featureFlags
}) => {
  return createTestServer({
    repositories: {
      summaryLogsRepository: summaryLogsRepositoryFactory,
      uploadsRepository,
      wasteRecordsRepository: wasteRecordsRepositoryFactory,
      organisationsRepository: () => organisationsRepository,
      wasteBalancesRepository: wasteBalancesRepositoryFactory,
      ...extraRepositories
    },
    workers: {
      summaryLogsWorker: submitterWorker,
      ...extraWorkers
    },
    featureFlags
  })
}

/**
 * @typedef {Object} IntegrationEnvironmentOptions
 * @property {string} [organisationId]
 * @property {string} [registrationId]
 * @property {string} [accreditationId]
 * @property {string} [registrationNumber]
 * @property {string} [accreditationNumber]
 * @property {Object} [extractorData]
 * @property {string} [wasteProcessingType]
 * @property {string} [reprocessingType]
 * @property {string} [material]
 * @property {Object} [featureFlags]
 * @property {Object} [extraRepositories]
 * @property {Object} [extraWorkers]
 */

/**
 * Setup a complete integration environment for summary log tests.
 * @param {IntegrationEnvironmentOptions} [options]
 */
export const setupIntegrationEnvironment = async (
  /** @type {IntegrationEnvironmentOptions} */ options = {}
) => {
  const {
    organisationId = new ObjectId().toString(),
    registrationId = new ObjectId().toString(),
    accreditationId = new ObjectId().toString(),
    registrationNumber = DEFAULT_REGISTRATION_ID,
    accreditationNumber = DEFAULT_ACCREDITATION_ID,
    extractorData = {},
    wasteProcessingType = DEFAULT_WASTE_PROCESSING_TYPE,
    reprocessingType = DEFAULT_REPROCESSING_TYPE,
    material = DEFAULT_MATERIAL,
    featureFlags: featureFlagsOverrides = {},
    extraRepositories = {},
    extraWorkers = {}
  } = options || {}

  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn()
  }

  const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
  const summaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)
  const uploadsRepository = createInMemoryUploadsRepository()

  const testOrg = buildIntegrationOrganisation({
    organisationId,
    registrationId,
    accreditationId,
    registrationNumber,
    accreditationNumber,
    material,
    wasteProcessingType,
    reprocessingType
  })

  const organisationsRepository = createInMemoryOrganisationsRepository([
    testOrg
  ])()
  const wasteRecordsRepositoryFactory = createInMemoryWasteRecordsRepository()
  const wasteRecordsRepository = wasteRecordsRepositoryFactory()

  const wasteBalancesRepositoryFactory = createInMemoryWasteBalancesRepository(
    [],
    { organisationsRepository }
  )
  const wasteBalancesRepository = wasteBalancesRepositoryFactory()

  const { summaryLogExtractor, validateSummaryLog, featureFlags, fileDataMap } =
    await buildIntegrationInfrastructure({
      summaryLogsRepository,
      organisationsRepository,
      wasteRecordsRepository,
      extractorData,
      featureFlagsOverrides
    })

  const syncWasteRecordsFn = syncFromSummaryLog({
    extractor: summaryLogExtractor,
    wasteRecordRepository: wasteRecordsRepository,
    wasteBalancesRepository,
    organisationsRepository
  })

  const submitterWorker = createSummaryLogSubmitterWorker({
    validate: validateSummaryLog,
    summaryLogsRepository,
    syncWasteRecords: syncWasteRecordsFn
  })

  const server = await createSummaryLogIntegrationServer({
    summaryLogsRepositoryFactory,
    uploadsRepository,
    wasteRecordsRepositoryFactory,
    organisationsRepository,
    wasteBalancesRepositoryFactory,
    extraRepositories,
    submitterWorker,
    extraWorkers,
    featureFlags
  })

  return {
    server,
    summaryLogsRepository,
    uploadsRepository,
    wasteRecordsRepository,
    wasteBalancesRepository,
    organisationsRepository,
    summaryLogExtractor,
    fileDataMap,
    submitterWorker,
    organisationId,
    registrationId,
    accreditationId,
    syncWasteRecords: async (log) => {
      if (log) {
        await syncWasteRecordsFn(log)
        return
      }
      /** @type {any} */
      const repo = summaryLogsRepository
      const logs = await repo.findAll()
      for (const l of logs) {
        if (l.summaryLog.status === SUMMARY_LOG_STATUS.SUBMITTED) {
          await syncWasteRecordsFn(l.summaryLog)
        }
      }
    }
  }
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
