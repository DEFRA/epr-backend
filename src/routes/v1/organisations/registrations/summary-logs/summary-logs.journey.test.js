import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs-repository.inmemory.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createServer } from '#server/server.js'

const mockLoggerInfo = vi.fn()
const mockLoggerError = vi.fn()
const mockLoggerWarn = vi.fn()

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: (...args) => mockLoggerInfo(...args),
    error: (...args) => mockLoggerError(...args),
    warn: (...args) => mockLoggerWarn(...args)
  }
}))

const organisationId = 'org-123'
const registrationId = 'reg-456'

const createUploadPayload = (fileStatus, fileId, filename) => ({
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
      s3Bucket: 'test-bucket',
      s3Key: `path/to/${filename}`
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

  beforeAll(async () => {
    const repository = createInMemorySummaryLogsRepository()
    server = await createServer({
      repositories: {
        summaryLogsRepository: repository
      },
      featureFlags: createInMemoryFeatureFlags({ summaryLogs: true })
    })
    await server.initialize()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('when file has not been uploaded yet', () => {
    test('returns preprocessing status', async () => {
      const summaryLogId = 'summary-999'

      const response = await server.inject({
        method: 'GET',
        url: buildGetUrl(summaryLogId)
      })

      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.payload)).toEqual({
        status: 'preprocessing'
      })
    })
  })

  describe('when file upload is successful', () => {
    test('progresses through preprocessing and validating states after upload', async () => {
      const summaryLogId = 'summary-789'

      // Step 1: GET before upload returns preprocessing
      const preprocessingResponse = await server.inject({
        method: 'GET',
        url: buildGetUrl(summaryLogId)
      })

      expect(preprocessingResponse.statusCode).toBe(200)
      expect(JSON.parse(preprocessingResponse.payload)).toEqual({
        status: 'preprocessing'
      })

      // Step 2: POST upload-completed creates document with validating status
      const uploadResponse = await server.inject({
        method: 'POST',
        url: buildPostUrl(summaryLogId),
        payload: createUploadPayload('complete', 'file-123', 'summary-log.xlsx')
      })

      expect(uploadResponse.statusCode).toBe(200)

      // Step 3: GET immediately after returns validating
      const validatingResponse = await server.inject({
        method: 'GET',
        url: buildGetUrl(summaryLogId)
      })

      expect(validatingResponse.statusCode).toBe(200)
      expect(JSON.parse(validatingResponse.payload)).toEqual({
        status: 'validating'
      })
    })
  })

  describe('when file is rejected by virus scan', () => {
    test('completes journey for rejected file', async () => {
      const summaryLogId = 'summary-888'

      // Step 1: Upload completed with rejected file
      const uploadResponse = await server.inject({
        method: 'POST',
        url: buildPostUrl(summaryLogId),
        payload: createUploadPayload('rejected', 'file-789', 'virus.xlsx')
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
          status: 'rejected',
          failureReason: 'File rejected by virus scan'
        })
      )
    })
  })

  describe('upload-completed logging', () => {
    test('logs successful upload completion with s3 details', async () => {
      const summaryLogId = 'summary-777'
      const fileId = 'file-456'
      const filename = 'test-file.xlsx'

      await server.inject({
        method: 'POST',
        url: buildPostUrl(summaryLogId),
        payload: createUploadPayload('complete', fileId, filename)
      })

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
        expect.stringContaining(
          `File upload completed for summaryLogId: ${summaryLogId} with fileId: ${fileId}, filename: ${filename}, status: complete, s3`
        )
      )
    })

    test('logs upload completion for pending status without s3 details', async () => {
      const summaryLogId = 'summary-666'
      const fileId = 'file-555'
      const filename = 'pending-file.xlsx'

      const payload = createUploadPayload('pending', fileId, filename)
      delete payload.form.file.s3Bucket
      delete payload.form.file.s3Key

      await server.inject({
        method: 'POST',
        url: buildPostUrl(summaryLogId),
        payload
      })

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
        expect.stringContaining(
          `File upload completed for summaryLogId: ${summaryLogId} with fileId: ${fileId}, filename: ${filename}, status: pending`
        )
      )

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.not.objectContaining({
            s3Bucket: expect.anything(),
            s3Key: expect.anything()
          })
        }),
        expect.any(String)
      )
    })

    test('logs upload completion for rejected status without s3 details', async () => {
      const summaryLogId = 'summary-555'
      const fileId = 'file-444'
      const filename = 'rejected-file.xlsx'

      const payload = createUploadPayload('rejected', fileId, filename)
      delete payload.form.file.s3Bucket
      delete payload.form.file.s3Key

      await server.inject({
        method: 'POST',
        url: buildPostUrl(summaryLogId),
        payload
      })

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
        expect.stringContaining(
          `File upload completed for summaryLogId: ${summaryLogId} with fileId: ${fileId}, filename: ${filename}, status: rejected`
        )
      )
    })
  })
})
