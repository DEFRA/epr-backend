import { SUMMARY_LOG_STATUS, UPLOAD_STATUS } from '#domain/summary-log.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs-repository.inmemory.js'
import { createServer } from '#server/server.js'
import { createInlineSummaryLogsValidator } from '#workers/summary-logs/validator/summary-logs-validator.inline.js'

const organisationId = 'org-123'
const registrationId = 'reg-456'

const createUploadPayload = (fileStatus, fileId, filename) => ({
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
      s3Bucket:
        fileStatus === UPLOAD_STATUS.COMPLETE ? 'test-bucket' : undefined,
      s3Key:
        fileStatus === UPLOAD_STATUS.COMPLETE
          ? `path/to/${filename}`
          : undefined
    }
  },
  numberOfRejectedFiles: fileStatus === UPLOAD_STATUS.REJECTED ? 1 : 0
})

const buildGetUrl = (summaryLogId) =>
  `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}`

const buildPostUrl = (summaryLogId) =>
  `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`

describe('Summary logs integration', () => {
  let server

  beforeAll(async () => {
    const summaryLogsRepository = createInMemorySummaryLogsRepository()
    const summaryLogsValidator = createInlineSummaryLogsValidator(
      summaryLogsRepository
    )
    const featureFlags = createInMemoryFeatureFlags({ summaryLogs: true })

    server = await createServer({
      repositories: {
        summaryLogsRepository
      },
      workers: {
        summaryLogsValidator
      },
      featureFlags
    })

    await server.initialize()
  })

  describe('when file has not been uploaded yet', () => {
    it('returns preprocessing status', async () => {
      const summaryLogId = 'summary-999'

      const response = await server.inject({
        method: 'GET',
        url: buildGetUrl(summaryLogId)
      })

      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.payload)).toEqual({
        status: SUMMARY_LOG_STATUS.PREPROCESSING
      })
    })
  })

  describe('when file upload is successful', () => {
    it('progresses through expected states after upload', async () => {
      const summaryLogId = 'summary-789'

      // Step 1: GET before upload returns preprocessing
      const preprocessingResponse = await server.inject({
        method: 'GET',
        url: buildGetUrl(summaryLogId)
      })

      expect(preprocessingResponse.statusCode).toBe(200)
      expect(JSON.parse(preprocessingResponse.payload)).toEqual({
        status: SUMMARY_LOG_STATUS.PREPROCESSING
      })

      // Step 2: POST upload-completed creates document with validating status
      const uploadResponse = await server.inject({
        method: 'POST',
        url: buildPostUrl(summaryLogId),
        payload: createUploadPayload(
          UPLOAD_STATUS.COMPLETE,
          'file-123',
          'summary-log.xlsx'
        )
      })

      expect(uploadResponse.statusCode).toBe(200)

      // Step 3: GET immediately after returns validating
      const validatingResponse = await server.inject({
        method: 'GET',
        url: buildGetUrl(summaryLogId)
      })

      expect(validatingResponse.statusCode).toBe(200)
      expect(JSON.parse(validatingResponse.payload)).toEqual({
        status: SUMMARY_LOG_STATUS.VALIDATING
      })

      // Step 4: GET once validation has had time to complete
      await new Promise((resolve) => setTimeout(resolve, 2000)) // This is temporary to emulate the delay until we implement parsing...

      const finalResponse = await server.inject({
        method: 'GET',
        url: buildGetUrl(summaryLogId)
      })

      expect(finalResponse.statusCode).toBe(200)
      expect(JSON.parse(finalResponse.payload)).toEqual({
        status: SUMMARY_LOG_STATUS.INVALID
      })
    })
  })

  describe('when file is rejected by virus scan', () => {
    it('completes journey for rejected file', async () => {
      const summaryLogId = 'summary-888'

      // Step 1: Upload completed with rejected file
      const uploadResponse = await server.inject({
        method: 'POST',
        url: buildPostUrl(summaryLogId),
        payload: createUploadPayload(
          UPLOAD_STATUS.REJECTED,
          'file-789',
          'virus.xlsx'
        )
      })

      expect(uploadResponse.statusCode).toBe(200)

      // Step 2: GET returns rejected status
      const rejectedResponse = await server.inject({
        method: 'GET',
        url: buildGetUrl(summaryLogId)
      })

      expect(rejectedResponse.statusCode).toBe(200)
      expect(JSON.parse(rejectedResponse.payload)).toEqual(
        expect.objectContaining({
          status: UPLOAD_STATUS.REJECTED,
          failureReason: 'File rejected by virus scan'
        })
      )
    })
  })
})
