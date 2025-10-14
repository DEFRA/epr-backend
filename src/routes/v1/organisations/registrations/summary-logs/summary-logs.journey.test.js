import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createServer } from '#server/server.js'

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
})
