import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs-repository.inmemory.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createServer } from '#server/server.js'

const organisationId = 'org-123'
const registrationId = 'reg-456'

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
    file: {
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
  numberOfRejectedFiles: fileStatus === 'rejected' ? 1 : 0
})

const buildGetUrl = (summaryLogId) =>
  `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}`

const buildPostUrl = (summaryLogId) =>
  `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`

describe('Summary logs journey', () => {
  let server

  beforeEach(async () => {
    const repository = createInMemorySummaryLogsRepository()
    server = await createServer({
      repositories: {
        summaryLogsRepository: repository
      },
      featureFlags: createInMemoryFeatureFlags({ summaryLogs: true })
    })
    await server.initialize()
    vi.clearAllMocks()
  })

  describe('retrieving summary log that has not been uploaded', () => {
    let response

    beforeEach(async () => {
      const summaryLogId = 'summary-999'

      response = await server.inject({
        method: 'GET',
        url: buildGetUrl(summaryLogId)
      })
    })

    test('returns OK', () => {
      expect(response.statusCode).toBe(200)
    })

    test('returns preprocessing status', () => {
      expect(JSON.parse(response.payload)).toEqual({
        status: 'preprocessing'
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
        payload: createUploadPayload('complete', fileId, filename)
      })
    })

    test('returns OK', () => {
      expect(uploadResponse.statusCode).toBe(200)
    })

    test('logs completion with file location', () => {
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          event: { category: 'summary-logs', action: 'request_success' },
          context: expect.objectContaining({
            summaryLogId,
            fileId,
            filename,
            fileStatus: 'complete',
            s3Bucket: 'test-bucket',
            s3Key: `path/to/${filename}`
          })
        }),
        `File upload completed for summaryLogId: ${summaryLogId} with fileId: ${fileId}, filename: ${filename}, status: complete, s3: bucket test-bucket, key path/to/${filename}`
      )
    })

    describe('retrieving summary log', () => {
      let response

      beforeEach(async () => {
        response = await server.inject({
          method: 'GET',
          url: buildGetUrl(summaryLogId)
        })
      })

      test('returns OK', () => {
        expect(response.statusCode).toBe(200)
      })

      test('returns validating status', () => {
        expect(JSON.parse(response.payload)).toEqual({
          status: 'validating'
        })
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
        payload: createUploadPayload('rejected', fileId, filename, false)
      })
    })

    test('returns OK', () => {
      expect(uploadResponse.statusCode).toBe(200)
    })

    test('logs completion', () => {
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          event: { category: 'summary-logs', action: 'request_success' },
          context: expect.objectContaining({
            summaryLogId,
            fileId,
            filename,
            fileStatus: 'rejected'
          })
        }),
        `File upload completed for summaryLogId: ${summaryLogId} with fileId: ${fileId}, filename: ${filename}, status: rejected`
      )
    })

    describe('retrieving summary log', () => {
      let response

      beforeEach(async () => {
        response = await server.inject({
          method: 'GET',
          url: buildGetUrl(summaryLogId)
        })
      })

      test('returns OK', () => {
        expect(response.statusCode).toBe(200)
      })

      test('returns rejected status with reason', () => {
        expect(JSON.parse(response.payload)).toEqual(
          expect.objectContaining({
            status: 'rejected',
            failureReason: 'File rejected by virus scan'
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
        payload: createUploadPayload('pending', fileId, filename, false)
      })
    })

    test('returns OK', () => {
      expect(uploadResponse.statusCode).toBe(200)
    })

    test('logs completion', () => {
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          event: { category: 'summary-logs', action: 'request_success' },
          context: expect.objectContaining({
            summaryLogId,
            fileId,
            filename,
            fileStatus: 'pending'
          })
        }),
        `File upload completed for summaryLogId: ${summaryLogId} with fileId: ${fileId}, filename: ${filename}, status: pending`
      )
    })
  })
})
