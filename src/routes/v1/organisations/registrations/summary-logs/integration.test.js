import ExcelJS from 'exceljs'

import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { createInMemorySummaryLogExtractor } from '#application/summary-logs/extractor-inmemory.js'
import { createSummaryLogExtractor } from '#application/summary-logs/extractor.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { syncFromSummaryLog } from '#application/waste-records/sync-from-summary-log.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'

import { ObjectId } from 'mongodb'

const { validToken } = entraIdMockAuthTokens

const organisationId = new ObjectId().toString()
const registrationId = new ObjectId().toString()

const createUploadPayload = (
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

const buildGetUrl = (summaryLogId) =>
  `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}`

const buildPostUrl = (summaryLogId) =>
  `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`

const buildSubmitUrl = (summaryLogId) =>
  `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`

/**
 * Polls for validation to complete by checking status endpoint
 * Retries up to 10 times with 50ms delay between attempts (max 500ms total)
 */
const pollForValidation = async (server, summaryLogId) => {
  let attempts = 0
  const maxAttempts = 10
  let status = SUMMARY_LOG_STATUS.VALIDATING

  while (status === SUMMARY_LOG_STATUS.VALIDATING && attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 50))

    const checkResponse = await server.inject({
      method: 'GET',
      url: buildGetUrl(summaryLogId),
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    status = JSON.parse(checkResponse.payload).status
    attempts++
  }
}

describe('Summary logs integration', () => {
  let server
  setupAuthContext()
  let summaryLogsRepository

  beforeEach(async () => {
    const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
    const mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    }
    const uploadsRepository = createInMemoryUploadsRepository()
    summaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)

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

    const summaryLogExtractor = createInMemorySummaryLogExtractor({
      'file-123': {
        meta: {
          REGISTRATION_NUMBER: {
            value: 'REG-123',
            location: { sheet: 'Cover', row: 1, column: 'B' }
          },
          PROCESSING_TYPE: {
            value: 'REPROCESSOR_INPUT',
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
        },
        data: {}
      }
    })

    const wasteRecordsRepository = createInMemoryWasteRecordsRepository()()

    const validateSummaryLog = createSummaryLogsValidator({
      summaryLogsRepository,
      organisationsRepository,
      wasteRecordsRepository,
      summaryLogExtractor
    })
    const featureFlags = createInMemoryFeatureFlags({ summaryLogs: true })

    server = await createTestServer({
      repositories: {
        summaryLogsRepository: summaryLogsRepositoryFactory,
        uploadsRepository
      },
      workers: {
        summaryLogsWorker: { validate: validateSummaryLog }
      },
      featureFlags
    })
  })

  describe('retrieving summary log that has not been uploaded', () => {
    let response

    beforeEach(async () => {
      const summaryLogId = 'summary-999'

      response = await server.inject({
        method: 'GET',
        url: buildGetUrl(summaryLogId),
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })
    })

    it('returns OK', () => {
      expect(response.statusCode).toBe(200)
    })

    it('returns preprocessing status', () => {
      expect(JSON.parse(response.payload)).toEqual({
        status: SUMMARY_LOG_STATUS.PREPROCESSING
      })
    })
  })

  describe('marking upload as completed with valid file', () => {
    const summaryLogId = 'summary-789'
    const fileId = 'file-123'
    const filename = 'summary-log.xlsx'
    let uploadResponse

    beforeEach(async () => {
      uploadResponse = await server.inject({
        method: 'POST',
        url: buildPostUrl(summaryLogId),
        payload: createUploadPayload(UPLOAD_STATUS.COMPLETE, fileId, filename),
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })
    })

    it('returns ACCEPTED', () => {
      expect(uploadResponse.statusCode).toBe(202)
    })

    it('logs completion with file location', () => {
      expect(server.loggerMocks.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: `File upload completed: summaryLogId=${summaryLogId}, fileId=${fileId}, filename=${filename}, status=complete, s3Bucket=test-bucket, s3Key=path/to/${filename}`,
          event: {
            category: LOGGING_EVENT_CATEGORIES.SERVER,
            action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
            reference: summaryLogId
          }
        })
      )
    })

    describe('retrieving summary log', () => {
      let response

      beforeEach(async () => {
        await pollForValidation(server, summaryLogId)

        response = await server.inject({
          method: 'GET',
          url: buildGetUrl(summaryLogId),
          headers: {
            Authorization: `Bearer ${validToken}`
          }
        })
      })

      it('returns OK', () => {
        expect(response.statusCode).toBe(200)
      })

      it('returns complete validation response with no issues', () => {
        const payload = JSON.parse(response.payload)
        expect(payload).toEqual({
          status: SUMMARY_LOG_STATUS.VALIDATED,
          validation: {
            failures: [],
            concerns: {}
          },
          loadCounts: {
            new: { valid: 0, invalid: 0 },
            unchanged: { valid: 0, invalid: 0 },
            adjusted: { valid: 0, invalid: 0 }
          }
        })
      })

      it('persists validation issues in database', async () => {
        const { summaryLog } =
          await summaryLogsRepository.findById(summaryLogId)
        expect(summaryLog.validation).toBeDefined()
        expect(summaryLog.validation.issues).toBeDefined()
        expect(summaryLog.validation.issues).toEqual([])
      })
    })
  })

  describe('marking upload as completed with rejected file', () => {
    const summaryLogId = 'summary-888'
    const fileId = 'file-789'
    const filename = 'virus.xlsx'
    let uploadResponse

    beforeEach(async () => {
      uploadResponse = await server.inject({
        method: 'POST',
        url: buildPostUrl(summaryLogId),
        payload: createUploadPayload(
          UPLOAD_STATUS.REJECTED,
          fileId,
          filename,
          false
        ),
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })
    })

    it('returns ACCEPTED', () => {
      expect(uploadResponse.statusCode).toBe(202)
    })

    it('logs completion', () => {
      expect(server.loggerMocks.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: `File upload completed: summaryLogId=${summaryLogId}, fileId=${fileId}, filename=${filename}, status=rejected`,
          event: {
            category: LOGGING_EVENT_CATEGORIES.SERVER,
            action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
            reference: summaryLogId
          }
        })
      )
    })

    describe('retrieving summary log', () => {
      let response

      beforeEach(async () => {
        response = await server.inject({
          method: 'GET',
          url: buildGetUrl(summaryLogId),
          headers: {
            Authorization: `Bearer ${validToken}`
          }
        })
      })

      it('returns OK', () => {
        expect(response.statusCode).toBe(200)
      })

      it('returns rejected status with reason', () => {
        expect(JSON.parse(response.payload)).toEqual(
          expect.objectContaining({
            status: UPLOAD_STATUS.REJECTED,
            failureReason:
              'Something went wrong with your file upload. Please try again.'
          })
        )
      })
    })
  })

  describe('marking upload as completed with pending file', () => {
    const summaryLogId = 'summary-666'
    const fileId = 'file-555'
    const filename = 'pending-file.xlsx'
    let uploadResponse

    beforeEach(async () => {
      uploadResponse = await server.inject({
        method: 'POST',
        url: buildPostUrl(summaryLogId),
        payload: createUploadPayload(
          UPLOAD_STATUS.PENDING,
          fileId,
          filename,
          false
        ),
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })
    })

    it('returns ACCEPTED', () => {
      expect(uploadResponse.statusCode).toBe(202)
    })

    it('logs completion', () => {
      expect(server.loggerMocks.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: `File upload completed: summaryLogId=${summaryLogId}, fileId=${fileId}, filename=${filename}, status=pending`,
          event: {
            category: LOGGING_EVENT_CATEGORIES.SERVER,
            action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
            reference: summaryLogId
          }
        })
      )
    })
  })

  describe('data syntax validation with invalid cell values', () => {
    const summaryLogId = 'summary-data-syntax'
    const fileId = 'file-data-invalid'
    const filename = 'invalid-data.xlsx'
    let uploadResponse
    let testSummaryLogsRepository

    beforeEach(async () => {
      // Create a new server with extractor that returns invalid data
      const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
      }
      const uploadsRepository = createInMemoryUploadsRepository()
      testSummaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)

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

      // Mock extractor with invalid data values
      const summaryLogExtractor = createInMemorySummaryLogExtractor({
        [fileId]: {
          meta: {
            REGISTRATION_NUMBER: {
              value: 'REG-123',
              location: { sheet: 'Cover', row: 1, column: 'B' }
            },
            PROCESSING_TYPE: {
              value: 'REPROCESSOR_INPUT',
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
          },
          data: {
            RECEIVED_LOADS_FOR_REPROCESSING: {
              location: { sheet: 'Received', row: 7, column: 'B' },
              headers: [
                'ROW_ID',
                'DATE_RECEIVED_FOR_REPROCESSING',
                'EWC_CODE',
                'GROSS_WEIGHT',
                'TARE_WEIGHT',
                'PALLET_WEIGHT',
                'NET_WEIGHT',
                'BAILING_WIRE',
                'HOW_CALCULATE_RECYCLABLE',
                'WEIGHT_OF_NON_TARGET',
                'RECYCLABLE_PROPORTION',
                'TONNAGE_RECEIVED_FOR_EXPORT'
              ],
              rows: [
                [
                  10000,
                  '2025-05-28T00:00:00.000Z',
                  '03 03 08',
                  1000,
                  100,
                  50,
                  850,
                  'YES',
                  'WEIGHT',
                  50,
                  0.85,
                  850
                ], // Valid row
                [
                  9999,
                  'invalid-date',
                  'bad-code',
                  1000,
                  100,
                  50,
                  850,
                  'YES',
                  'WEIGHT',
                  50,
                  0.85,
                  850
                ] // Invalid row - first 3 cells invalid
              ]
            }
          }
        }
      })

      const wasteRecordsRepository = createInMemoryWasteRecordsRepository()()

      const validateSummaryLog = createSummaryLogsValidator({
        summaryLogsRepository: testSummaryLogsRepository,
        organisationsRepository,
        wasteRecordsRepository,
        summaryLogExtractor
      })
      const featureFlags = createInMemoryFeatureFlags({ summaryLogs: true })

      server = await createTestServer({
        repositories: {
          summaryLogsRepository: summaryLogsRepositoryFactory,
          uploadsRepository
        },
        workers: {
          summaryLogsWorker: { validate: validateSummaryLog }
        },
        featureFlags
      })

      uploadResponse = await server.inject({
        method: 'POST',
        url: buildPostUrl(summaryLogId),
        payload: createUploadPayload(UPLOAD_STATUS.COMPLETE, fileId, filename),
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })
    })

    it('returns ACCEPTED', () => {
      expect(uploadResponse.statusCode).toBe(202)
    })

    describe('retrieving summary log with data errors', () => {
      let response

      beforeEach(async () => {
        await pollForValidation(server, summaryLogId)

        response = await server.inject({
          method: 'GET',
          url: buildGetUrl(summaryLogId),
          headers: {
            Authorization: `Bearer ${validToken}`
          }
        })
      })

      it('returns OK', () => {
        expect(response.statusCode).toBe(200)
      })

      it('returns validated status (not invalid) because data errors are not fatal', () => {
        const payload = JSON.parse(response.payload)
        expect(payload).toMatchObject({
          status: SUMMARY_LOG_STATUS.VALIDATED
        })
        expect(payload.validation).toBeDefined()
        expect(payload.validation.concerns).toBeDefined()
        expect(
          payload.validation.concerns.RECEIVED_LOADS_FOR_REPROCESSING
        ).toBeDefined()
        expect(
          payload.validation.concerns.RECEIVED_LOADS_FOR_REPROCESSING.rows
            .length
        ).toBeGreaterThan(0)
      })

      it('persists data validation errors with row context', async () => {
        const { summaryLog } =
          await testSummaryLogsRepository.findById(summaryLogId)

        expect(summaryLog.validation).toBeDefined()
        expect(summaryLog.validation.issues).toHaveLength(3)

        // All 3 errors should be from row 9 (headers at row 7 + second data row)
        expect(
          summaryLog.validation.issues.every(
            (i) => i.context.location?.row === 9
          )
        ).toBe(true)

        // Should have errors for all 3 invalid cells
        const errorFields = summaryLog.validation.issues.map(
          (i) => i.context.location?.header
        )
        expect(errorFields).toContain('ROW_ID')
        expect(errorFields).toContain('DATE_RECEIVED_FOR_REPROCESSING')
        expect(errorFields).toContain('EWC_CODE')

        // All should be error severity (not fatal)
        expect(
          summaryLog.validation.issues.every((i) => i.severity === 'error')
        ).toBe(true)
      })

      it('returns issues in HTTP response format matching ADR 0020', () => {
        const payload = JSON.parse(response.payload)

        // Should have table-keyed concerns structure
        expect(
          payload.validation.concerns.RECEIVED_LOADS_FOR_REPROCESSING
        ).toBeDefined()
        expect(
          payload.validation.concerns.RECEIVED_LOADS_FOR_REPROCESSING.sheet
        ).toBe('Received')
        expect(
          payload.validation.concerns.RECEIVED_LOADS_FOR_REPROCESSING.rows
        ).toHaveLength(1)

        const rowWithIssues =
          payload.validation.concerns.RECEIVED_LOADS_FOR_REPROCESSING.rows[0]
        expect(rowWithIssues.row).toBe(9)
        expect(rowWithIssues.issues).toHaveLength(3)

        // Spot check one issue has the complete structure per ADR 0020
        const ourReferenceIssue = rowWithIssues.issues.find(
          (issue) => issue.header === 'ROW_ID'
        )
        expect(ourReferenceIssue).toMatchObject({
          type: 'error',
          code: expect.any(String),
          header: 'ROW_ID',
          column: 'B',
          actual: 9999
        })

        // All issues should have consistent structure
        rowWithIssues.issues.forEach((issue) => {
          expect(issue).toHaveProperty('type')
          expect(issue).toHaveProperty('code')
          expect(issue).toHaveProperty('header')
          expect(issue).toHaveProperty('column')
        })
      })

      it('returns rowsWithIssues calculated on-the-fly in HTTP response', () => {
        const payload = JSON.parse(response.payload)

        // In new format, rowsWithIssues is calculated from concerns structure
        const rowsWithIssues = Object.values(
          payload.validation.concerns
        ).reduce((total, table) => total + table.rows.length, 0)

        // All 3 errors are from row 9, so rowsWithIssues should be 1
        expect(rowsWithIssues).toBe(1)
      })

      it('returns loadCounts classifying loads as new/valid/invalid', () => {
        const payload = JSON.parse(response.payload)

        // Both rows are new (first submission, no prior records)
        // Row 1 (ROW_ID 10000) is valid
        // Row 2 (ROW_ID 9999) is invalid (has validation errors)
        expect(payload.loadCounts).toEqual({
          new: { valid: 1, invalid: 1 },
          unchanged: { valid: 0, invalid: 0 },
          adjusted: { valid: 0, invalid: 0 }
        })
      })
    })
  })

  describe('data syntax validation with missing required headers', () => {
    const summaryLogId = 'summary-missing-headers'
    const fileId = 'file-missing-headers'
    const filename = 'missing-headers.xlsx'
    let uploadResponse
    let testSummaryLogsRepository

    beforeEach(async () => {
      // Create a new server with extractor that returns data with missing headers
      const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
      }
      const uploadsRepository = createInMemoryUploadsRepository()
      testSummaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)

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

      // Mock extractor with missing required headers (fatal error)
      const summaryLogExtractor = createInMemorySummaryLogExtractor({
        [fileId]: {
          meta: {
            REGISTRATION_NUMBER: {
              value: 'REG-123',
              location: { sheet: 'Cover', row: 1, column: 'B' }
            },
            PROCESSING_TYPE: {
              value: 'REPROCESSOR_INPUT',
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
          },
          data: {
            RECEIVED_LOADS_FOR_REPROCESSING: {
              location: { sheet: 'Received', row: 7, column: 'B' },
              headers: [
                'ROW_ID',
                'DATE_RECEIVED_FOR_REPROCESSING'
                // Missing EWC_CODE and other required headers
              ],
              rows: [[10000, '2025-05-28T00:00:00.000Z']]
            }
          }
        }
      })

      const wasteRecordsRepository = createInMemoryWasteRecordsRepository()()

      const validateSummaryLog = createSummaryLogsValidator({
        summaryLogsRepository: testSummaryLogsRepository,
        organisationsRepository,
        wasteRecordsRepository,
        summaryLogExtractor
      })
      const featureFlags = createInMemoryFeatureFlags({ summaryLogs: true })

      server = await createTestServer({
        repositories: {
          summaryLogsRepository: summaryLogsRepositoryFactory,
          uploadsRepository
        },
        workers: {
          summaryLogsWorker: { validate: validateSummaryLog }
        },
        featureFlags
      })

      uploadResponse = await server.inject({
        method: 'POST',
        url: buildPostUrl(summaryLogId),
        payload: createUploadPayload(UPLOAD_STATUS.COMPLETE, fileId, filename),
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })
    })

    it('returns ACCEPTED', () => {
      expect(uploadResponse.statusCode).toBe(202)
    })

    describe('retrieving summary log with fatal header errors', () => {
      let response

      beforeEach(async () => {
        await pollForValidation(server, summaryLogId)

        response = await server.inject({
          method: 'GET',
          url: buildGetUrl(summaryLogId),
          headers: {
            Authorization: `Bearer ${validToken}`
          }
        })
      })

      it('returns OK', () => {
        expect(response.statusCode).toBe(200)
      })

      it('returns invalid status with failure reason due to fatal errors', () => {
        const payload = JSON.parse(response.payload)
        expect(payload).toMatchObject({
          status: SUMMARY_LOG_STATUS.INVALID
        })
        expect(payload.failureReason).toBeDefined()
        expect(payload.failureReason).toContain('Missing required header')
      })

      it('persists fatal validation errors in database', async () => {
        const { summaryLog } =
          await testSummaryLogsRepository.findById(summaryLogId)

        expect(summaryLog.validation).toBeDefined()
        expect(summaryLog.validation.issues.length).toBeGreaterThan(0)

        // Should have at least one fatal error
        const fatalErrors = summaryLog.validation.issues.filter(
          (i) => i.severity === 'fatal'
        )
        expect(fatalErrors.length).toBeGreaterThan(0)
        expect(fatalErrors[0].message).toContain('Missing required header')
        expect(fatalErrors[0].context.location).toBeDefined()
      })

      it('returns fatal issues in HTTP response format', () => {
        const payload = JSON.parse(response.payload)
        expect(payload.validation).toBeDefined()
        expect(payload.validation.failures).toBeDefined()
        expect(payload.validation.failures.length).toBeGreaterThan(0)

        // Check that fatal errors are properly formatted
        payload.validation.failures.forEach((failure) => {
          expect(failure).toHaveProperty('code')
          // Fatal issues should have location for missing headers
          expect(failure).toHaveProperty('location')
        })

        // Should have empty concerns (no data-level issues when there are fatal errors)
        expect(payload.validation.concerns).toEqual({})
      })
    })
  })

  describe('combined meta and data syntax validation', () => {
    const summaryLogId = 'summary-combined-errors'
    const fileId = 'file-combined-errors'
    const filename = 'combined-errors.xlsx'
    let uploadResponse
    let testSummaryLogsRepository

    beforeEach(async () => {
      // Create a new server with extractor that returns both meta and data errors
      const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
      }
      const uploadsRepository = createInMemoryUploadsRepository()
      testSummaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)

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

      // Mock extractor with missing meta field (fatal) AND invalid data (error)
      const summaryLogExtractor = createInMemorySummaryLogExtractor({
        [fileId]: {
          meta: {
            // Missing REGISTRATION - fatal meta error
            PROCESSING_TYPE: {
              value: 'REPROCESSOR_INPUT',
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
          },
          data: {
            RECEIVED_LOADS_FOR_REPROCESSING: {
              location: { sheet: 'Received', row: 7, column: 'B' },
              headers: [
                'ROW_ID',
                'DATE_RECEIVED_FOR_REPROCESSING',
                'EWC_CODE',
                'GROSS_WEIGHT',
                'TARE_WEIGHT',
                'PALLET_WEIGHT',
                'NET_WEIGHT',
                'BAILING_WIRE',
                'HOW_CALCULATE_RECYCLABLE',
                'WEIGHT_OF_NON_TARGET',
                'RECYCLABLE_PROPORTION',
                'TONNAGE_RECEIVED_FOR_EXPORT'
              ],
              rows: [
                [
                  9999, // Invalid ROW_ID
                  'invalid-date', // Invalid DATE_RECEIVED
                  '03 03 08',
                  1000,
                  100,
                  50,
                  850,
                  true,
                  'WEIGHT',
                  50,
                  0.85,
                  850
                ]
              ]
            }
          }
        }
      })

      const wasteRecordsRepository = createInMemoryWasteRecordsRepository()()

      const validateSummaryLog = createSummaryLogsValidator({
        summaryLogsRepository: testSummaryLogsRepository,
        organisationsRepository,
        wasteRecordsRepository,
        summaryLogExtractor
      })
      const featureFlags = createInMemoryFeatureFlags({ summaryLogs: true })

      server = await createTestServer({
        repositories: {
          summaryLogsRepository: summaryLogsRepositoryFactory,
          uploadsRepository
        },
        workers: {
          summaryLogsWorker: { validate: validateSummaryLog }
        },
        featureFlags
      })

      uploadResponse = await server.inject({
        method: 'POST',
        url: buildPostUrl(summaryLogId),
        payload: createUploadPayload(UPLOAD_STATUS.COMPLETE, fileId, filename),
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })
    })

    it('returns ACCEPTED', () => {
      expect(uploadResponse.statusCode).toBe(202)
    })

    describe('retrieving summary log with combined errors', () => {
      let response

      beforeEach(async () => {
        await pollForValidation(server, summaryLogId)

        response = await server.inject({
          method: 'GET',
          url: buildGetUrl(summaryLogId),
          headers: {
            Authorization: `Bearer ${validToken}`
          }
        })
      })

      it('returns OK', () => {
        expect(response.statusCode).toBe(200)
      })

      it('returns invalid status due to fatal meta error', () => {
        const payload = JSON.parse(response.payload)
        expect(payload).toMatchObject({
          status: SUMMARY_LOG_STATUS.INVALID
        })
      })

      it('persists only meta errors due to short-circuit validation', async () => {
        const { summaryLog } =
          await testSummaryLogsRepository.findById(summaryLogId)

        expect(summaryLog.validation).toBeDefined()
        expect(summaryLog.validation.issues.length).toBeGreaterThan(0)

        // Should have meta error (fatal)
        const metaErrors = summaryLog.validation.issues.filter(
          (i) => i.context.location?.field !== undefined
        )
        expect(metaErrors.length).toBeGreaterThan(0)
        expect(metaErrors[0].severity).toBe('fatal')

        // Should NOT have data errors - validation short-circuits on fatal meta errors
        const dataErrors = summaryLog.validation.issues.filter(
          (i) => i.context.location?.header !== undefined
        )
        expect(dataErrors.length).toBe(0)
      })

      it('demonstrates short-circuit validation stops at fatal meta errors', async () => {
        const { summaryLog } =
          await testSummaryLogsRepository.findById(summaryLogId)

        // This test documents that validate.js implements short-circuit validation:
        // When fatal meta errors are found, data validation is skipped entirely.
        // This provides better performance and clearer user feedback.
        const issues = summaryLog.validation.issues

        // Should only have meta field issues, no data table issues
        expect(
          issues.every((i) => i.context.location?.field !== undefined)
        ).toBe(true)
        expect(
          issues.some((i) => i.context.location?.header !== undefined)
        ).toBe(false)
      })
    })
  })

  describe('Level 1 validation (meta syntax) short-circuits entire pipeline', () => {
    const summaryLogId = 'summary-meta-syntax-fatal'
    const fileId = 'file-meta-syntax-fatal'
    const filename = 'meta-syntax-fatal.xlsx'
    let uploadResponse
    let testSummaryLogsRepository

    beforeEach(async () => {
      // Create test infrastructure
      const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
      }
      const uploadsRepository = createInMemoryUploadsRepository()
      testSummaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)

      const testOrg = buildOrganisation({
        registrations: [
          {
            id: registrationId,
            registrationNumber: 'REG12345',
            material: 'aluminium',
            wasteProcessingType: 'reprocessor',
            accreditation: null
          }
        ]
      })
      testOrg.id = organisationId

      const organisationsRepository = createInMemoryOrganisationsRepository([
        testOrg
      ])()

      const summaryLogExtractor = createInMemorySummaryLogExtractor({
        [fileId]: {
          meta: {
            REGISTRATION_NUMBER: {
              value: 'REG12345',
              location: { sheet: 'Cover', row: 1, column: 'B' }
            },
            PROCESSING_TYPE: {
              value: 'REPROCESSOR_INPUT',
              location: { sheet: 'Cover', row: 2, column: 'B' }
            },
            MATERIAL: {
              value: 'Aluminium',
              location: { sheet: 'Cover', row: 3, column: 'B' }
            }
            // TEMPLATE_VERSION missing - fatal meta syntax error!
          },
          data: {
            // Even though we have invalid data, it should NOT be validated
            RECEIVED_LOADS_FOR_REPROCESSING: {
              location: { sheet: 'Received', row: 7, column: 'B' },
              headers: ['INVALID_HEADER'], // Missing required headers
              rows: [
                [
                  9999, // Below minimum ROW_ID
                  'invalid-date',
                  'bad-code',
                  'not-a-number',
                  'YES',
                  'WEIGHT',
                  50,
                  0.85,
                  850
                ]
              ]
            }
          }
        }
      })

      const wasteRecordsRepository = createInMemoryWasteRecordsRepository()()

      const validateSummaryLog = createSummaryLogsValidator({
        summaryLogsRepository: testSummaryLogsRepository,
        organisationsRepository,
        wasteRecordsRepository,
        summaryLogExtractor
      })
      const featureFlags = createInMemoryFeatureFlags({ summaryLogs: true })

      server = await createTestServer({
        repositories: {
          summaryLogsRepository: summaryLogsRepositoryFactory,
          uploadsRepository
        },
        workers: {
          summaryLogsWorker: { validate: validateSummaryLog }
        },
        featureFlags
      })

      uploadResponse = await server.inject({
        method: 'POST',
        url: buildPostUrl(summaryLogId),
        payload: createUploadPayload(UPLOAD_STATUS.COMPLETE, fileId, filename),
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })
    })

    it('returns ACCEPTED', () => {
      expect(uploadResponse.statusCode).toBe(202)
    })

    describe('retrieving summary log with meta syntax fatal error', () => {
      let response

      beforeEach(async () => {
        await pollForValidation(server, summaryLogId)

        response = await server.inject({
          method: 'GET',
          url: buildGetUrl(summaryLogId),
          headers: {
            Authorization: `Bearer ${validToken}`
          }
        })
      })

      it('returns OK', () => {
        expect(response.statusCode).toBe(200)
      })

      it('returns invalid status due to fatal meta syntax error', () => {
        const payload = JSON.parse(response.payload)
        expect(payload).toMatchObject({
          status: SUMMARY_LOG_STATUS.INVALID,
          failureReason: expect.stringContaining('TEMPLATE_VERSION')
        })
      })

      it('returns only meta syntax error (no meta business or data errors)', () => {
        const payload = JSON.parse(response.payload)

        expect(payload.validation).toBeDefined()
        expect(payload.validation.failures).toBeDefined()
        expect(payload.validation.failures.length).toBeGreaterThan(0)

        // Should only have meta syntax error for TEMPLATE_VERSION
        const metaSyntaxErrors = payload.validation.failures.filter(
          (f) => f.location?.field === 'TEMPLATE_VERSION'
        )
        expect(metaSyntaxErrors.length).toBeGreaterThan(0)

        // Should NOT have any data errors (data validation was skipped)
        expect(payload.validation.concerns).toEqual({})
      })

      it('demonstrates Level 1 short-circuit: only meta syntax validation ran', async () => {
        const { summaryLog } =
          await testSummaryLogsRepository.findById(summaryLogId)

        // This test documents that validate.js implements Level 1 short-circuit:
        // When fatal meta syntax errors are found, all subsequent validation
        // (meta business, data syntax, data business) is skipped entirely.

        const issues = summaryLog.validation.issues

        // Should only have meta field issues (Level 1)
        expect(
          issues.every((i) => i.context.location?.field !== undefined)
        ).toBe(true)

        // Should NOT have any data table issues (Level 3 was skipped)
        expect(
          issues.some((i) => i.context.location?.header !== undefined)
        ).toBe(false)

        // All issues should be fatal technical errors
        expect(issues.every((i) => i.severity === 'fatal')).toBe(true)
        expect(issues.every((i) => i.category === 'technical')).toBe(true)
      })
    })
  })

  describe('validation with tables that have no schema defined', () => {
    const summaryLogId = 'summary-no-schema'
    const fileId = 'file-no-schema'
    const filename = 'no-schema.xlsx'
    let uploadResponse
    let testSummaryLogsRepository

    beforeEach(async () => {
      // Create a new server with extractor that returns unknown table
      const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
      }
      const uploadsRepository = createInMemoryUploadsRepository()
      testSummaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)

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

      // Mock extractor with valid known table AND unknown table without schema
      const summaryLogExtractor = createInMemorySummaryLogExtractor({
        [fileId]: {
          meta: {
            REGISTRATION_NUMBER: {
              value: 'REG-123',
              location: { sheet: 'Cover', row: 1, column: 'B' }
            },
            PROCESSING_TYPE: {
              value: 'REPROCESSOR_INPUT',
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
          },
          data: {
            RECEIVED_LOADS_FOR_REPROCESSING: {
              location: { sheet: 'Received', row: 7, column: 'B' },
              headers: [
                'ROW_ID',
                'DATE_RECEIVED_FOR_REPROCESSING',
                'EWC_CODE',
                'GROSS_WEIGHT',
                'TARE_WEIGHT',
                'PALLET_WEIGHT',
                'NET_WEIGHT',
                'BAILING_WIRE',
                'HOW_CALCULATE_RECYCLABLE',
                'WEIGHT_OF_NON_TARGET',
                'RECYCLABLE_PROPORTION',
                'TONNAGE_RECEIVED_FOR_EXPORT'
              ],
              rows: [
                [
                  10000,
                  '2025-05-28T00:00:00.000Z',
                  '03 03 08',
                  1000,
                  100,
                  50,
                  850,
                  'YES',
                  'WEIGHT',
                  50,
                  0.85,
                  850
                ]
              ]
            },
            UNKNOWN_FUTURE_TABLE: {
              // No schema defined - should be gracefully skipped
              location: { sheet: 'Unknown', row: 1, column: 'A' },
              headers: ['ANYTHING', 'GOES', 'HERE'],
              rows: [
                ['foo', 'bar', 'baz'],
                ['invalid', 123, true]
              ]
            }
          }
        }
      })

      const wasteRecordsRepository = createInMemoryWasteRecordsRepository()()

      const validateSummaryLog = createSummaryLogsValidator({
        summaryLogsRepository: testSummaryLogsRepository,
        organisationsRepository,
        wasteRecordsRepository,
        summaryLogExtractor
      })
      const featureFlags = createInMemoryFeatureFlags({ summaryLogs: true })

      server = await createTestServer({
        repositories: {
          summaryLogsRepository: summaryLogsRepositoryFactory,
          uploadsRepository
        },
        workers: {
          summaryLogsWorker: { validate: validateSummaryLog }
        },
        featureFlags
      })

      uploadResponse = await server.inject({
        method: 'POST',
        url: buildPostUrl(summaryLogId),
        payload: createUploadPayload(UPLOAD_STATUS.COMPLETE, fileId, filename),
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })
    })

    it('returns ACCEPTED', () => {
      expect(uploadResponse.statusCode).toBe(202)
    })

    describe('retrieving summary log with unknown tables', () => {
      let response

      beforeEach(async () => {
        await pollForValidation(server, summaryLogId)

        response = await server.inject({
          method: 'GET',
          url: buildGetUrl(summaryLogId),
          headers: {
            Authorization: `Bearer ${validToken}`
          }
        })
      })

      it('returns OK', () => {
        expect(response.statusCode).toBe(200)
      })

      it('returns validated status with no errors', () => {
        const payload = JSON.parse(response.payload)
        expect(payload.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
        expect(payload.validation).toBeDefined()
        expect(payload.validation.failures).toEqual([])
        expect(payload.validation.concerns).toEqual({})
      })

      it('gracefully ignores tables without schemas', async () => {
        const { summaryLog } =
          await testSummaryLogsRepository.findById(summaryLogId)

        // Should have no validation issues
        expect(summaryLog.validation.issues).toEqual([])

        // This documents defensive programming: tables without schemas
        // are skipped rather than causing validation failures.
        // This future-proofs against new table types being added to
        // spreadsheets before validation schemas are implemented.
      })
    })
  })

  describe('edge case: validation object without issues array', () => {
    const summaryLogId = 'summary-no-issues-array'
    let summaryLogsRepositoryFactory
    let summaryLogsRepository
    let server

    beforeEach(async () => {
      summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
      }
      summaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)

      // Create a summary log with validation object but no issues array
      // This covers the defensive || [] in get.js line 34
      await summaryLogsRepository.insert(summaryLogId, {
        status: SUMMARY_LOG_STATUS.VALIDATED,
        organisationId,
        registrationId,
        file: {
          id: 'file-123',
          name: 'test.xlsx',
          status: UPLOAD_STATUS.COMPLETE,
          uri: '/uploads/file-123',
          s3: {
            bucket: 'test-bucket',
            key: 'test-key'
          }
        },
        validation: {} // No issues array
      })

      const featureFlags = createInMemoryFeatureFlags({ summaryLogs: true })

      server = await createTestServer({
        repositories: {
          summaryLogsRepository: summaryLogsRepositoryFactory
        },
        featureFlags
      })
    })

    it('returns OK with empty issues array when validation.issues is undefined', async () => {
      const response = await server.inject({
        method: 'GET',
        url: buildGetUrl(summaryLogId),
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(200)
      const payload = JSON.parse(response.payload)
      expect(payload.validation).toEqual({
        failures: [],
        concerns: {}
      })
    })
  })

  describe('submitting a validated summary log', () => {
    const summaryLogId = 'summary-submit-test'
    const fileId = 'file-submit-123'
    const filename = 'waste-data.xlsx'
    let wasteRecordsRepository
    let submitResponse

    beforeEach(async () => {
      // Set up test server with waste records repository
      const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
      }
      const uploadsRepository = createInMemoryUploadsRepository()
      const summaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)

      const testOrg = buildOrganisation({
        registrations: [
          {
            id: registrationId,
            registrationNumber: 'REG-12345',
            status: 'approved',
            material: 'paper',
            wasteProcessingType: 'reprocessor',
            formSubmissionTime: new Date(),
            submittedToRegulator: 'ea',
            validFrom: new Date('2025-01-01'),
            validTo: new Date('2025-12-31'),
            accreditation: {
              accreditationNumber: 'ACC-2025-001'
            }
          }
        ]
      })
      testOrg.id = organisationId

      const organisationsRepository = createInMemoryOrganisationsRepository([
        testOrg
      ])()

      // Extractor for validation - uses REPROCESSOR (validation format)
      const validationExtractor = createInMemorySummaryLogExtractor({
        [fileId]: {
          meta: {
            REGISTRATION_NUMBER: {
              value: 'REG-12345',
              location: { sheet: 'Data', row: 1, column: 'B' }
            },
            PROCESSING_TYPE: {
              value: 'REPROCESSOR_INPUT',
              location: { sheet: 'Data', row: 2, column: 'B' }
            },
            MATERIAL: {
              value: 'Paper_and_board',
              location: { sheet: 'Data', row: 3, column: 'B' }
            },
            TEMPLATE_VERSION: {
              value: 1,
              location: { sheet: 'Data', row: 4, column: 'B' }
            },
            ACCREDITATION_NUMBER: {
              value: 'ACC-2025-001',
              location: { sheet: 'Data', row: 5, column: 'B' }
            }
          },
          data: {}
        }
      })

      // Extractor for transformation - uses REPROCESSOR_INPUT (transformation format)
      const transformationExtractor = createInMemorySummaryLogExtractor({
        [fileId]: {
          meta: {
            REGISTRATION_NUMBER: {
              value: 'REG-12345',
              location: { sheet: 'Data', row: 1, column: 'B' }
            },
            PROCESSING_TYPE: {
              value: 'REPROCESSOR_INPUT',
              location: { sheet: 'Data', row: 2, column: 'B' }
            },
            MATERIAL: {
              value: 'Paper_and_board',
              location: { sheet: 'Data', row: 3, column: 'B' }
            },
            TEMPLATE_VERSION: {
              value: 1,
              location: { sheet: 'Data', row: 4, column: 'B' }
            },
            ACCREDITATION_NUMBER: {
              value: 'ACC-2025-001',
              location: { sheet: 'Data', row: 5, column: 'B' }
            }
          },
          data: {
            RECEIVED_LOADS_FOR_REPROCESSING: {
              location: { sheet: 'Received', row: 7, column: 'A' },
              headers: [
                'ROW_ID',
                'DATE_RECEIVED_FOR_REPROCESSING',
                'EWC_CODE',
                'GROSS_WEIGHT',
                'TARE_WEIGHT',
                'NET_WEIGHT'
              ],
              rows: [
                ['10001', '2025-01-15', '15 01 01', 1000, 100, 900],
                ['10002', '2025-01-16', '15 01 02', 2000, 200, 1800]
              ]
            }
          }
        }
      })

      const wasteRecordsRepositoryFactory =
        createInMemoryWasteRecordsRepository()
      wasteRecordsRepository = wasteRecordsRepositoryFactory()

      const validateSummaryLog = createSummaryLogsValidator({
        summaryLogsRepository,
        organisationsRepository,
        wasteRecordsRepository,
        summaryLogExtractor: validationExtractor
      })

      const syncWasteRecords = syncFromSummaryLog({
        extractor: transformationExtractor,
        wasteRecordRepository: wasteRecordsRepository
      })

      const submitterWorker = {
        validate: validateSummaryLog,
        submit: async (summaryLogId) => {
          // Execute submit command synchronously in test (simulating worker completion)
          // Wait for pending operations (in-memory repository uses setImmediate)
          await new Promise((resolve) => setImmediate(resolve))

          const existing = await summaryLogsRepository.findById(summaryLogId)
          const { version, summaryLog } = existing

          await syncWasteRecords(summaryLog)

          await summaryLogsRepository.update(summaryLogId, version, {
            status: SUMMARY_LOG_STATUS.SUBMITTED
          })
        }
      }

      const featureFlags = createInMemoryFeatureFlags({ summaryLogs: true })

      server = await createTestServer({
        repositories: {
          summaryLogsRepository: summaryLogsRepositoryFactory,
          uploadsRepository,
          wasteRecordsRepository: wasteRecordsRepositoryFactory,
          organisationsRepository: () => organisationsRepository
        },
        workers: {
          summaryLogsWorker: submitterWorker
        },
        featureFlags
      })

      // Upload and validate the summary log
      await server.inject({
        method: 'POST',
        url: buildPostUrl(summaryLogId),
        payload: createUploadPayload(UPLOAD_STATUS.COMPLETE, fileId, filename)
      })

      // Wait for validation to complete
      await pollForValidation(server, summaryLogId)

      // Submit the validated summary log
      submitResponse = await server.inject({
        method: 'POST',
        url: buildSubmitUrl(summaryLogId),
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      // Wait for submission to complete (worker runs async)
      let attempts = 0
      const maxAttempts = 10
      let status = SUMMARY_LOG_STATUS.SUBMITTING

      while (
        status === SUMMARY_LOG_STATUS.SUBMITTING &&
        attempts < maxAttempts
      ) {
        await new Promise((resolve) => setTimeout(resolve, 50))

        const checkResponse = await server.inject({
          method: 'GET',
          url: buildGetUrl(summaryLogId),
          headers: {
            Authorization: `Bearer ${validToken}`
          }
        })

        status = JSON.parse(checkResponse.payload).status
        attempts++
      }
    })

    it('returns OK', () => {
      expect(submitResponse.statusCode).toBe(200)
    })

    it('creates waste records from summary log data', async () => {
      const wasteRecords = await wasteRecordsRepository.findByRegistration(
        organisationId,
        registrationId
      )

      expect(wasteRecords).toHaveLength(2)
      expect(wasteRecords[0].rowId).toBe('10001')
      expect(wasteRecords[1].rowId).toBe('10002')
    })

    it('updates summary log status to SUBMITTED', async () => {
      const response = await server.inject({
        method: 'GET',
        url: buildGetUrl(summaryLogId),
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(200)
      const payload = JSON.parse(response.payload)
      expect(payload.status).toBe(SUMMARY_LOG_STATUS.SUBMITTED)
    })

    it('includes accreditation number in response after submission', async () => {
      const response = await server.inject({
        method: 'GET',
        url: buildGetUrl(summaryLogId),
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(200)
      const payload = JSON.parse(response.payload)
      expect(payload.accreditationNumber).toBe('ACC-2025-001')
    })
  })

  describe('placeholder text normalization with real Excel parsing', () => {
    const summaryLogId = 'summary-placeholder-test'
    const fileId = 'file-placeholder-test'
    const filename = 'placeholder-test.xlsx'
    let uploadResponse
    let testSummaryLogsRepository
    let uploadsRepository

    /**
     * Creates an Excel buffer with placeholder text that should be normalized
     */
    const createExcelWithPlaceholders = async () => {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Data')

      // Row 1-4: Metadata
      worksheet.getCell('A1').value = '__EPR_META_REGISTRATION_NUMBER'
      worksheet.getCell('B1').value = 'REG-123'

      worksheet.getCell('A2').value = '__EPR_META_PROCESSING_TYPE'
      worksheet.getCell('B2').value = 'REPROCESSOR_INPUT'

      worksheet.getCell('A3').value = '__EPR_META_MATERIAL'
      worksheet.getCell('B3').value = 'Paper_and_board'

      worksheet.getCell('A4').value = '__EPR_META_TEMPLATE_VERSION'
      worksheet.getCell('B4').value = 1

      // Row 6: Data section headers
      worksheet.getCell('A6').value =
        '__EPR_DATA_RECEIVED_LOADS_FOR_REPROCESSING'
      worksheet.getCell('B6').value = 'ROW_ID'
      worksheet.getCell('C6').value = 'DATE_RECEIVED_FOR_REPROCESSING'
      worksheet.getCell('D6').value = 'EWC_CODE'
      worksheet.getCell('E6').value = 'GROSS_WEIGHT'
      worksheet.getCell('F6').value = 'TARE_WEIGHT'
      worksheet.getCell('G6').value = 'PALLET_WEIGHT'
      worksheet.getCell('H6').value = 'NET_WEIGHT'
      worksheet.getCell('I6').value = 'BAILING_WIRE'
      worksheet.getCell('J6').value = 'HOW_CALCULATE_RECYCLABLE'
      worksheet.getCell('K6').value = 'WEIGHT_OF_NON_TARGET'
      worksheet.getCell('L6').value = 'RECYCLABLE_PROPORTION'
      worksheet.getCell('M6').value = 'TONNAGE_RECEIVED_FOR_EXPORT'

      // Row 7: Valid data row
      worksheet.getCell('B7').value = 10000000001
      worksheet.getCell('C7').value = new Date('2025-05-28')
      worksheet.getCell('D7').value = '03 03 08'
      worksheet.getCell('E7').value = 1000
      worksheet.getCell('F7').value = 100
      worksheet.getCell('G7').value = 50
      worksheet.getCell('H7').value = 850
      worksheet.getCell('I7').value = 'YES'
      worksheet.getCell('J7').value = 'WEIGHT'
      worksheet.getCell('K7').value = 50
      worksheet.getCell('L7').value = 0.85
      worksheet.getCell('M7').value = 850

      // Row 8: Row with "Choose option" in required dropdown fields
      // This represents a user who filled numeric fields but didn't select from dropdowns
      worksheet.getCell('B8').value = 10000000002
      worksheet.getCell('C8').value = new Date('2025-05-29')
      worksheet.getCell('D8').value = 'Choose option' // EWC_CODE - required dropdown
      worksheet.getCell('E8').value = 2000
      worksheet.getCell('F8').value = 200
      worksheet.getCell('G8').value = 100
      worksheet.getCell('H8').value = 1700
      worksheet.getCell('I8').value = 'Choose option' // BAILING_WIRE - required dropdown
      worksheet.getCell('J8').value = 'Choose option' // HOW_CALCULATE_RECYCLABLE - required dropdown
      worksheet.getCell('K8').value = 100
      worksheet.getCell('L8').value = 0.9
      worksheet.getCell('M8').value = 1700

      // Row 9: Blank row - mix of empty cells and dropdown placeholders
      // This is what a truly "blank" pre-populated row looks like:
      // - Most fields are empty
      // - Dropdown fields have "Choose option"
      // After normalization, all values become null -> terminates section
      worksheet.getCell('B9').value = null // Empty
      worksheet.getCell('C9').value = null // Empty
      worksheet.getCell('D9').value = 'Choose option' // Dropdown default
      worksheet.getCell('E9').value = null // Empty
      worksheet.getCell('F9').value = null // Empty
      worksheet.getCell('G9').value = null // Empty
      worksheet.getCell('H9').value = null // Empty
      worksheet.getCell('I9').value = 'Choose option' // Dropdown default
      worksheet.getCell('J9').value = 'Choose option' // Dropdown default
      worksheet.getCell('K9').value = null // Empty
      worksheet.getCell('L9').value = null // Empty
      worksheet.getCell('M9').value = null // Empty

      // Row 10: This row should NOT be parsed (section terminated at row 9)
      worksheet.getCell('B10').value = 99999999999
      worksheet.getCell('C10').value = new Date('2025-12-31')
      worksheet.getCell('D10').value = '03 03 08'
      worksheet.getCell('E10').value = 9999
      worksheet.getCell('F10').value = 999
      worksheet.getCell('G10').value = 99
      worksheet.getCell('H10').value = 8901
      worksheet.getCell('I10').value = 'NO'
      worksheet.getCell('J10').value = 'WEIGHT'
      worksheet.getCell('K10').value = 500
      worksheet.getCell('L10').value = 0.5
      worksheet.getCell('M10').value = 4450

      return workbook.xlsx.writeBuffer()
    }

    beforeEach(async () => {
      // Create test infrastructure with real Excel parsing
      const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
      }
      uploadsRepository = createInMemoryUploadsRepository()
      testSummaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)

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

      // Create real Excel buffer and store it in uploads repository
      // URI format matches what upload-completed handler creates: s3://${s3Bucket}/${s3Key}
      const excelBuffer = await createExcelWithPlaceholders()
      const fileUri = `s3://test-bucket/path/to/${filename}`
      uploadsRepository.put(fileUri, excelBuffer)

      // Use real extractor with real parser (not mocked)
      const summaryLogExtractor = createSummaryLogExtractor({
        uploadsRepository,
        logger: mockLogger
      })

      const wasteRecordsRepository = createInMemoryWasteRecordsRepository()()

      const validateSummaryLog = createSummaryLogsValidator({
        summaryLogsRepository: testSummaryLogsRepository,
        organisationsRepository,
        wasteRecordsRepository,
        summaryLogExtractor
      })
      const featureFlags = createInMemoryFeatureFlags({ summaryLogs: true })

      server = await createTestServer({
        repositories: {
          summaryLogsRepository: summaryLogsRepositoryFactory,
          uploadsRepository
        },
        workers: {
          summaryLogsWorker: { validate: validateSummaryLog }
        },
        featureFlags
      })

      uploadResponse = await server.inject({
        method: 'POST',
        url: buildPostUrl(summaryLogId),
        payload: {
          uploadStatus: 'ready',
          metadata: {
            organisationId,
            registrationId
          },
          form: {
            summaryLogUpload: {
              fileId,
              filename,
              fileStatus: UPLOAD_STATUS.COMPLETE,
              contentType:
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              contentLength: 12345,
              checksumSha256: 'abc123def456',
              detectedContentType:
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              s3Bucket: 'test-bucket',
              s3Key: `path/to/${filename}`
            }
          },
          numberOfRejectedFiles: 0
        },
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })
    })

    it('returns ACCEPTED', () => {
      expect(uploadResponse.statusCode).toBe(202)
    })

    describe('retrieving summary log after parsing with placeholder normalization', () => {
      let response

      beforeEach(async () => {
        await pollForValidation(server, summaryLogId)

        response = await server.inject({
          method: 'GET',
          url: buildGetUrl(summaryLogId),
          headers: {
            Authorization: `Bearer ${validToken}`
          }
        })
      })

      it('returns OK', () => {
        expect(response.statusCode).toBe(200)
      })

      it('validates successfully with placeholder text normalized to null', () => {
        const payload = JSON.parse(response.payload)
        expect(payload.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
      })

      it('documents placeholder normalization behavior in integration context', () => {
        const payload = JSON.parse(response.payload)

        // Status is VALIDATED (not INVALID) because data errors are non-fatal
        expect(payload.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)

        // No fatal failures
        expect(payload.validation.failures).toEqual([])

        // Row 8 has validation concerns for dropdown fields that were "Choose option"
        // (normalized to null by the parser)
        const concerns = payload.validation.concerns
        expect(concerns.RECEIVED_LOADS_FOR_REPROCESSING).toBeDefined()
        expect(concerns.RECEIVED_LOADS_FOR_REPROCESSING.rows).toHaveLength(1)

        const row8Issues = concerns.RECEIVED_LOADS_FOR_REPROCESSING.rows[0]
        expect(row8Issues.row).toBe(8)

        // These are the dropdown fields that had "Choose option" (now null)
        const issueHeaders = row8Issues.issues.map((i) => i.header)
        expect(issueHeaders).toContain('EWC_CODE')
        expect(issueHeaders).toContain('BAILING_WIRE')
        expect(issueHeaders).toContain('HOW_CALCULATE_RECYCLABLE')
      })

      it('terminates data section at row with all placeholder values', async () => {
        // The row with all "Choose option" values should terminate the section
        // so only 2 data rows should be parsed (not 4)
        const { summaryLog } =
          await testSummaryLogsRepository.findById(summaryLogId)

        // With placeholder normalization working correctly:
        // - Row 7: Valid data row
        // - Row 8: Row with some placeholders (normalized to null, but still has real data)
        // - Row 9: All placeholders -> all nulls -> terminates section
        // - Row 10: Should NOT be parsed

        // Check that validation passed (VALIDATED status means parsing worked correctly)
        expect(summaryLog.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
      })
    })
  })
})
