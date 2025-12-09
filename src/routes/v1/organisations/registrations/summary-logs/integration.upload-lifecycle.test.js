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

import { ObjectId } from 'mongodb'

import {
  validToken,
  createUploadPayload,
  buildGetUrl,
  buildPostUrl,
  pollForValidation,
  createStandardMeta,
  createTestInfrastructure
} from './integration-test-helpers.js'

describe('Summary logs upload lifecycle', () => {
  let server
  let summaryLogsRepository
  let organisationId
  let registrationId

  setupAuthContext()

  beforeEach(async () => {
    organisationId = new ObjectId().toString()
    registrationId = new ObjectId().toString()

    const result = await createTestInfrastructure(
      organisationId,
      registrationId,
      {
        'file-123': {
          meta: createStandardMeta('REPROCESSOR_INPUT'),
          data: {}
        }
      }
    )
    server = result.server
    summaryLogsRepository = result.summaryLogsRepository
  })

  describe('retrieving summary log that has not been uploaded', () => {
    let response

    beforeEach(async () => {
      const summaryLogId = 'summary-999'

      response = await server.inject({
        method: 'GET',
        url: buildGetUrl(organisationId, registrationId, summaryLogId),
        headers: {
          Authorization: `Bearer ${validToken}`
        }
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
        ),
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })
    })

    it('should return ACCEPTED', () => {
      expect(uploadResponse.statusCode).toBe(202)
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
          headers: {
            Authorization: `Bearer ${validToken}`
          }
        })
      })

      it('should return OK', () => {
        expect(response.statusCode).toBe(200)
      })

      it('should return complete validation response with no issues', () => {
        const payload = JSON.parse(response.payload)
        expect(payload).toEqual({
          status: SUMMARY_LOG_STATUS.VALIDATED,
          validation: {
            failures: [],
            concerns: {}
          },
          loads: createEmptyLoads()
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
        ),
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })
    })

    it('should return ACCEPTED', () => {
      expect(uploadResponse.statusCode).toBe(202)
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
          headers: {
            Authorization: `Bearer ${validToken}`
          }
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
        ),
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })
    })

    it('should return ACCEPTED', () => {
      expect(uploadResponse.statusCode).toBe(202)
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
