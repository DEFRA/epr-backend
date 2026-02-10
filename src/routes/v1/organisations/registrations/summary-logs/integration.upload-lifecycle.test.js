import { StatusCodes } from 'http-status-codes'
import { ObjectId } from 'mongodb'
import { createEmptyLoads } from '#application/summary-logs/classify-loads.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import {
  asStandardUser,
  createUploadPayload,
  buildGetUrl,
  buildPostUrl,
  pollForValidation,
  createStandardMeta,
  setupIntegrationEnvironment
} from './test-helpers/index.js'

const TEST_RESULT_OK = 'should return OK'
const TEST_RESULT_ACCEPTED = 'should return ACCEPTED'

describe('Summary logs upload lifecycle', () => {
  let server
  let summaryLogsRepository
  let organisationId
  let registrationId

  setupAuthContext()

  beforeEach(async () => {
    const env = await setupIntegrationEnvironment(
      /** @type {any} */ ({
        registrationNumber: 'REG-123',
        accreditationNumber: 'ACC-123',
        extractorData: {
          'file-123': {
            meta: createStandardMeta('REPROCESSOR_INPUT'),
            data: {}
          }
        }
      })
    )
    server = env.server
    summaryLogsRepository = env.summaryLogsRepository
    organisationId = env.organisationId
    registrationId = env.registrationId
  })

  describe('retrieving summary log that has not been uploaded', () => {
    let response

    beforeEach(async () => {
      const summaryLogId = 'summary-999'

      response = await server.inject({
        method: 'GET',
        url: buildGetUrl(organisationId, registrationId, summaryLogId),
        ...asStandardUser({ linkedOrgId: organisationId })
      })
    })

    it(TEST_RESULT_OK, () => {
      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('should return preprocessing status', () => {
      expect(JSON.parse(response.payload)).toEqual({
        status: SUMMARY_LOG_STATUS.PREPROCESSING
      })
    })
  })
})

describe('Summary logs upload lifecycle - valid file', () => {
  let server
  let organisationId
  let registrationId
  let summaryLogsRepository

  setupAuthContext()

  beforeEach(async () => {
    const env = await setupIntegrationEnvironment(
      /** @type {any} */ ({
        registrationNumber: 'REG-123',
        accreditationNumber: 'ACC-123',
        extractorData: {
          'file-123': {
            meta: createStandardMeta('REPROCESSOR_INPUT'),
            data: {}
          }
        }
      })
    )
    server = env.server
    summaryLogsRepository = env.summaryLogsRepository
    organisationId = env.organisationId
    registrationId = env.registrationId
  })

  describe('marking upload as completed with valid file', () => {
    const summaryLogId = 'summary-789'
    const fileId = 'file-123'
    const filename = 'summary-log.xlsx'
    let uploadResponse

    beforeEach(async () => {
      uploadResponse = await server.inject({
        method: 'POST',
        url: buildPostUrl(organisationId, registrationId, summaryLogId),
        payload: createUploadPayload(
          organisationId,
          registrationId,
          UPLOAD_STATUS.COMPLETE,
          fileId,
          filename
        )
      })
    })

    it(TEST_RESULT_ACCEPTED, () => {
      expect(uploadResponse.statusCode).toBe(StatusCodes.ACCEPTED)
    })

    it('should log completion with file location', () => {
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
        await pollForValidation(
          server,
          organisationId,
          registrationId,
          summaryLogId
        )

        response = await server.inject({
          method: 'GET',
          url: buildGetUrl(organisationId, registrationId, summaryLogId),
          ...asStandardUser({ linkedOrgId: organisationId })
        })
      })

      it('should return OK', () => {
        expect(response.statusCode).toBe(StatusCodes.OK)
      })

      it('should return complete validation response with no issues', () => {
        const payload = JSON.parse(response.payload)
        expect(payload).toEqual({
          status: SUMMARY_LOG_STATUS.VALIDATED,
          validation: {
            failures: [],
            concerns: {}
          },
          loads: createEmptyLoads(),
          processingType: 'REPROCESSOR_INPUT',
          material: 'Paper_and_board',
          accreditationNumber: 'ACC-123'
        })
      })

      it('should persist validation issues in database', async () => {
        const { summaryLog } =
          await summaryLogsRepository.findById(summaryLogId)
        expect(summaryLog.validation).toBeDefined()
        expect(summaryLog.validation.issues).toBeDefined()
        expect(summaryLog.validation.issues).toEqual([])
      })
    })
  })
})

describe('Summary logs upload lifecycle - rejected and pending files', () => {
  let organisationId
  let registrationId
  let server

  setupAuthContext()

  beforeEach(async () => {
    const env = await setupIntegrationEnvironment(
      /** @type {any} */ ({
        registrationNumber: 'REG-123',
        accreditationNumber: 'ACC-123',
        extractorData: {
          'file-123': {
            meta: createStandardMeta('REPROCESSOR_INPUT'),
            data: {}
          }
        }
      })
    )
    server = env.server
    organisationId = env.organisationId
    registrationId = env.registrationId
  })

  describe('marking upload as completed with rejected file', () => {
    const summaryLogId = 'summary-888'
    const fileId = 'file-789'
    const filename = 'virus.xlsx'
    let uploadResponse

    beforeEach(async () => {
      uploadResponse = await server.inject({
        method: 'POST',
        url: buildPostUrl(organisationId, registrationId, summaryLogId),
        payload: createUploadPayload(
          organisationId,
          registrationId,
          UPLOAD_STATUS.REJECTED,
          fileId,
          filename,
          false
        )
      })
    })

    it(TEST_RESULT_ACCEPTED, () => {
      expect(uploadResponse.statusCode).toBe(StatusCodes.ACCEPTED)
    })

    it('should log completion', () => {
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
          url: buildGetUrl(organisationId, registrationId, summaryLogId),
          ...asStandardUser({ linkedOrgId: organisationId })
        })
      })

      it(TEST_RESULT_OK, () => {
        expect(response.statusCode).toBe(StatusCodes.OK)
      })

      it('should return rejected status with validation failure code', () => {
        expect(JSON.parse(response.payload)).toEqual(
          expect.objectContaining({
            status: UPLOAD_STATUS.REJECTED,
            validation: {
              failures: [{ code: 'FILE_REJECTED' }],
              concerns: {}
            }
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
        url: buildPostUrl(organisationId, registrationId, summaryLogId),
        payload: createUploadPayload(
          organisationId,
          registrationId,
          UPLOAD_STATUS.PENDING,
          fileId,
          filename,
          false
        )
      })
    })

    it(TEST_RESULT_ACCEPTED, () => {
      expect(uploadResponse.statusCode).toBe(StatusCodes.ACCEPTED)
    })

    it('should log completion', () => {
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
})
