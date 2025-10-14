import { StatusCodes } from 'http-status-codes'
import { summaryLogsUploadCompletedPath } from './upload-completed.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createServer } from '#server/server.js'
import { SUMMARY_LOG_STATUS, UPLOAD_STATUS } from '#domain/summary-log.js'

const summaryLogId = 'summary-log-123'

const organisationId = 'org-123'
const registrationId = 'reg-456'

const fileId = 'file-123'
const filename = 'test.xlsx'
const fileStatus = 'complete'
const s3Bucket = 'test-bucket'
const s3Key = 'test-key'

describe(`${summaryLogsUploadCompletedPath} route`, () => {
  let server
  let payload
  let summaryLog

  let summaryLogsRepository
  let summaryLogsValidator

  beforeAll(async () => {
    summaryLogsRepository = {
      insert: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn().mockResolvedValue(null),
      updateStatus: vi.fn().mockResolvedValue(undefined)
    }

    summaryLogsValidator = {
      validate: vi.fn()
    }

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

  beforeEach(() => {
    payload = {
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
          s3Bucket,
          s3Key
        }
      },
      numberOfRejectedFiles: 0
    }

    summaryLog = {
      id: summaryLogId,
      status: SUMMARY_LOG_STATUS.VALIDATING,
      file: {
        id: fileId,
        name: filename,
        status: fileStatus,
        s3: {
          bucket: s3Bucket,
          key: s3Key
        }
      }
    }
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns 200 when valid payload', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`,
      payload
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
  })

  it('should add summary log to repository when file has been accepted', async () => {
    await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`,
      payload
    })

    expect(summaryLogsRepository.insert).toHaveBeenCalledWith(summaryLog)
  })

  it('should add summary log to repository with failure reason when file has been rejected', async () => {
    payload.form.summaryLogUpload.fileStatus = UPLOAD_STATUS.REJECTED
    delete payload.form.summaryLogUpload.s3Bucket
    delete payload.form.summaryLogUpload.s3Key
    payload.numberOfRejectedFiles = 1

    await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`,
      payload
    })

    expect(summaryLogsRepository.insert).toHaveBeenCalledWith({
      id: summaryLogId,
      status: SUMMARY_LOG_STATUS.REJECTED,
      file: {
        id: fileId,
        name: filename,
        status: UPLOAD_STATUS.REJECTED
      },
      failureReason: 'File rejected by virus scan'
    })
  })

  it('should invoke validation as expected when file has been accepted', async () => {
    await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`,
      payload
    })

    expect(summaryLogsValidator.validate).toHaveBeenCalledWith(summaryLog)
  })

  it('should not invoke validation when file has been rejected', async () => {
    payload.form.summaryLogUpload.fileStatus = UPLOAD_STATUS.REJECTED
    delete payload.form.summaryLogUpload.s3Bucket
    delete payload.form.summaryLogUpload.s3Key
    payload.numberOfRejectedFiles = 1

    await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`,
      payload
    })

    expect(summaryLogsValidator.validate).not.toHaveBeenCalled()
  })

  it('returns 400 if payload is not an object', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`,
      payload: 'not-an-object'
    })

    expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(/Invalid request payload JSON format/)
  })

  it('returns 422 if payload is null', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`,
      payload: null
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('returns 422 if payload is missing form.summaryLogUpload', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`,
      payload: {
        uploadStatus: 'ready'
      }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    const body = JSON.parse(response.payload)
    expect(body.message).toContain('"form" is required')
  })

  it('returns 422 when file is complete but missing S3 info', async () => {
    delete payload.form.summaryLogUpload.s3Bucket
    delete payload.form.summaryLogUpload.s3Key

    const response = await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`,
      payload
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    const body = JSON.parse(response.payload)
    expect(body.message).toContain('s3Bucket')
  })

  it('returns 409 if summary log already exists', async () => {
    summaryLogsRepository.findById.mockResolvedValue(summaryLog)

    const response = await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`,
      payload
    })

    expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    const body = JSON.parse(response.payload)
    expect(body.message).toContain(`Summary log ${summaryLogId} already exists`)
  })

  it('returns 200 when file is rejected without S3 info', async () => {
    payload.form.summaryLogUpload.fileStatus = UPLOAD_STATUS.REJECTED
    delete payload.form.summaryLogUpload.s3Bucket
    delete payload.form.summaryLogUpload.s3Key
    payload.numberOfRejectedFiles = 1

    const response = await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`,
      payload
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
  })

  it('returns 200 when file is pending without S3 info', async () => {
    payload.form.summaryLogUpload.fileStatus = UPLOAD_STATUS.PENDING
    delete payload.form.summaryLogUpload.s3Bucket
    delete payload.form.summaryLogUpload.s3Key

    const response = await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/pending-${summaryLogId}/upload-completed`,
      payload
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
  })
})
