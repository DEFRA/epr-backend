import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import { ObjectId } from 'mongodb'

import {
  asStandardUser,
  createUploadPayload,
  buildGetUrl,
  buildPostUrl,
  pollForValidation,
  createReprocessorInputWorkbook,
  createSpreadsheetInfrastructure
} from './integration-test-helpers.js'

describe('Summary logs upload lifecycle', () => {
  let server
  let summaryLogsRepository
  let organisationId
  let registrationId
  let s3Bucket
  let s3Key

  const summaryLogId = 'summary-789'
  const fileId = 'file-123'
  const filename = 'summary-log.xlsx'

  setupAuthContext()

  beforeEach(async () => {
    organisationId = new ObjectId().toString()
    registrationId = new ObjectId().toString()

    const workbook = createReprocessorInputWorkbook()
    const spreadsheetBuffer = await workbook.xlsx.writeBuffer()

    const result = await createSpreadsheetInfrastructure({
      organisationId,
      registrationId,
      summaryLogId,
      spreadsheetBuffer
    })

    server = result.server
    summaryLogsRepository = result.summaryLogsRepository
    s3Bucket = result.s3Bucket
    s3Key = result.s3Key
  })

  describe('retrieving summary log that has not been uploaded', () => {
    let response

    beforeEach(async () => {
      const unknownSummaryLogId = 'summary-999'

      response = await server.inject({
        method: 'GET',
        url: buildGetUrl(organisationId, registrationId, unknownSummaryLogId),
        ...asStandardUser({ linkedOrgId: organisationId })
      })
    })

    it('should return OK', () => {
      expect(response.statusCode).toBe(200)
    })

    it('should return preprocessing status', () => {
      expect(JSON.parse(response.payload)).toEqual({
        status: SUMMARY_LOG_STATUS.PREPROCESSING
      })
    })
  })

  describe('marking upload as completed with valid file', () => {
    let uploadResponse

    beforeEach(async () => {
      uploadResponse = await server.inject({
        method: 'POST',
        url: buildPostUrl(organisationId, registrationId, summaryLogId),
        payload: {
          uploadStatus: 'ready',
          metadata: { organisationId, registrationId },
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
              s3Bucket,
              s3Key
            }
          },
          numberOfRejectedFiles: 0
        }
      })
    })

    it('should return ACCEPTED', () => {
      expect(uploadResponse.statusCode).toBe(202)
    })

    it('should log completion with file location', () => {
      expect(server.loggerMocks.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: `File upload completed: summaryLogId=${summaryLogId}, fileId=${fileId}, filename=${filename}, status=complete, s3Bucket=${s3Bucket}, s3Key=${s3Key}`,
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
        expect(response.statusCode).toBe(200)
      })

      it('should return complete validation response with no issues', () => {
        const payload = JSON.parse(response.payload)
        expect(payload.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
        expect(payload.validation).toEqual({
          failures: [],
          concerns: {}
        })
        expect(payload.loads).toEqual(
          expect.objectContaining({
            added: expect.objectContaining({
              valid: expect.objectContaining({ count: 1 })
            })
          })
        )
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

  describe('marking upload as completed with rejected file', () => {
    const rejectedSummaryLogId = 'summary-888'
    const rejectedFileId = 'file-789'
    const rejectedFilename = 'virus.xlsx'
    let uploadResponse

    beforeEach(async () => {
      uploadResponse = await server.inject({
        method: 'POST',
        url: buildPostUrl(organisationId, registrationId, rejectedSummaryLogId),
        payload: createUploadPayload(
          organisationId,
          registrationId,
          UPLOAD_STATUS.REJECTED,
          rejectedFileId,
          rejectedFilename,
          false
        )
      })
    })

    it('should return ACCEPTED', () => {
      expect(uploadResponse.statusCode).toBe(202)
    })

    it('should log completion', () => {
      expect(server.loggerMocks.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: `File upload completed: summaryLogId=${rejectedSummaryLogId}, fileId=${rejectedFileId}, filename=${rejectedFilename}, status=rejected`,
          event: {
            category: LOGGING_EVENT_CATEGORIES.SERVER,
            action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
            reference: rejectedSummaryLogId
          }
        })
      )
    })

    describe('retrieving summary log', () => {
      let response

      beforeEach(async () => {
        response = await server.inject({
          method: 'GET',
          url: buildGetUrl(
            organisationId,
            registrationId,
            rejectedSummaryLogId
          ),
          ...asStandardUser({ linkedOrgId: organisationId })
        })
      })

      it('should return OK', () => {
        expect(response.statusCode).toBe(200)
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
    const pendingSummaryLogId = 'summary-666'
    const pendingFileId = 'file-555'
    const pendingFilename = 'pending-file.xlsx'
    let uploadResponse

    beforeEach(async () => {
      uploadResponse = await server.inject({
        method: 'POST',
        url: buildPostUrl(organisationId, registrationId, pendingSummaryLogId),
        payload: createUploadPayload(
          organisationId,
          registrationId,
          UPLOAD_STATUS.PENDING,
          pendingFileId,
          pendingFilename,
          false
        )
      })
    })

    it('should return ACCEPTED', () => {
      expect(uploadResponse.statusCode).toBe(202)
    })

    it('should log completion', () => {
      expect(server.loggerMocks.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: `File upload completed: summaryLogId=${pendingSummaryLogId}, fileId=${pendingFileId}, filename=${pendingFilename}, status=pending`,
          event: {
            category: LOGGING_EVENT_CATEGORIES.SERVER,
            action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
            reference: pendingSummaryLogId
          }
        })
      )
    })
  })
})
