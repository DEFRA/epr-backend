import { StatusCodes } from 'http-status-codes'

import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import { summaryLogsUploadCompletedPath } from './post.js'

const { validToken } = entraIdMockAuthTokens

const summaryLogId = 'summary-log-123'

const organisationId = 'org-123'
const registrationId = 'reg-456'

const fileId = 'file-123'
const filename = 'test.xlsx'
const fileStatus = 'complete'
const s3Bucket = 'test-bucket'
const s3Key = 'test-key'

const createFileDetails = (overrides) => ({
  fileId: 'file-123',
  filename: 'test.xlsx',
  fileStatus: 'complete',
  s3Bucket: 'test-bucket',
  s3Key: 'test-key',
  ...overrides
})

const createUploadCompletedPayload = (overrides) => ({
  uploadStatus: 'ready',
  metadata: {
    organisationId,
    registrationId
  },
  form: {
    summaryLogUpload: createFileDetails()
  },
  numberOfRejectedFiles: 0,
  ...overrides
})

const createPendingPayload = (fileId = 'file-pending-123') =>
  createUploadCompletedPayload({
    form: {
      summaryLogUpload: createFileDetails({
        fileId,
        filename: 'scanning.xlsx',
        fileStatus: 'pending',
        s3Bucket: undefined,
        s3Key: undefined
      })
    }
  })

const createRejectedPayload = (fileId = 'file-rejected-123') =>
  createUploadCompletedPayload({
    form: {
      summaryLogUpload: createFileDetails({
        fileId,
        filename: 'virus.xlsx',
        fileStatus: 'rejected',
        hasError: true,
        errorMessage: 'The selected file contains a virus',
        s3Bucket: undefined,
        s3Key: undefined
      })
    },
    numberOfRejectedFiles: 1
  })

const createCompletePayload = (fileId = 'file-complete-123') =>
  createUploadCompletedPayload({
    form: {
      summaryLogUpload: createFileDetails({
        fileId,
        filename: 'test.xlsx',
        fileStatus: 'complete',
        s3Bucket: 'test-bucket',
        s3Key: 'test-key'
      })
    }
  })

describe(`${summaryLogsUploadCompletedPath} route`, () => {
  setupAuthContext()
  let server
  let payload

  let summaryLogsRepository
  let summaryLogsWorker

  beforeAll(async () => {
    summaryLogsRepository = {
      insert: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn().mockResolvedValue(null),
      updateStatus: vi.fn().mockResolvedValue(undefined)
    }

    summaryLogsWorker = {
      validate: vi.fn()
    }

    const featureFlags = createInMemoryFeatureFlags({ summaryLogs: true })

    server = await createTestServer({
      repositories: {
        summaryLogsRepository: (_logger) => summaryLogsRepository
      },
      workers: {
        summaryLogsWorker
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

    summaryLogsRepository.findById.mockResolvedValue(null)
  })

  afterEach(() => {
    server.loggerMocks.info.mockClear()
    server.loggerMocks.error.mockClear()
    server.loggerMocks.warn.mockClear()

    vi.resetAllMocks()
  })

  afterAll(async () => {
    await server.stop()
  })

  it('should return expected response when uploaded file was accepted', async () => {
    summaryLogsRepository.findById.mockResolvedValueOnce(null)
    summaryLogsRepository.findById.mockResolvedValueOnce({
      version: 1,
      summaryLog: {
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

    const response = await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`,
      payload,
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.ACCEPTED)
  })

  it('should add expected summary log to repository when uploaded file was accepted', async () => {
    await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`,
      payload,
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(summaryLogsRepository.insert).toHaveBeenCalledWith(summaryLogId, {
      status: SUMMARY_LOG_STATUS.VALIDATING,
      organisationId,
      registrationId,
      file: {
        id: fileId,
        name: filename,
        status: fileStatus,
        uri: `s3://${s3Bucket}/${s3Key}`
      }
    })
  })

  it('should add expected summary log to repository with validation when uploaded file was rejected', async () => {
    payload.form.summaryLogUpload.fileStatus = UPLOAD_STATUS.REJECTED
    delete payload.form.summaryLogUpload.s3Bucket
    delete payload.form.summaryLogUpload.s3Key
    payload.numberOfRejectedFiles = 1

    await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`,
      payload,
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(summaryLogsRepository.insert).toHaveBeenCalledWith(summaryLogId, {
      status: SUMMARY_LOG_STATUS.REJECTED,
      organisationId,
      registrationId,
      file: {
        id: fileId,
        name: filename,
        status: UPLOAD_STATUS.REJECTED
      },
      validation: {
        failures: [{ code: 'FILE_REJECTED' }]
      }
    })
  })

  it('should invoke validation as expected when uploaded file was accepted', async () => {
    summaryLogsRepository.findById.mockResolvedValueOnce(null)
    summaryLogsRepository.findById.mockResolvedValueOnce({
      version: 1,
      summaryLog: {
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

    await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`,
      payload,
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(summaryLogsWorker.validate).toHaveBeenCalledWith(summaryLogId)
  })

  it('should not invoke validation when uploaded file is still pending', async () => {
    payload.form.summaryLogUpload.fileStatus = UPLOAD_STATUS.PENDING
    delete payload.form.summaryLogUpload.s3Bucket
    delete payload.form.summaryLogUpload.s3Key

    await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`,
      payload,
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(summaryLogsWorker.validate).not.toHaveBeenCalled()
  })

  it('should not invoke validation when uploaded file was rejected', async () => {
    payload.form.summaryLogUpload.fileStatus = UPLOAD_STATUS.REJECTED
    delete payload.form.summaryLogUpload.s3Bucket
    delete payload.form.summaryLogUpload.s3Key
    payload.numberOfRejectedFiles = 1

    await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`,
      payload,
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(summaryLogsWorker.validate).not.toHaveBeenCalled()
  })

  it('returns 400 if payload is not an object', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`,
      payload: 'not-an-object',
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(/Invalid request payload JSON format/)
  })

  it('returns 422 if payload is null', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`,
      payload: null,
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('returns 422 if payload is missing form.summaryLogUpload', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`,
      payload: {
        uploadStatus: 'ready'
      },
      headers: {
        Authorization: `Bearer ${validToken}`
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
      payload,
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    const body = JSON.parse(response.payload)
    expect(body.message).toContain('s3Bucket')
  })

  it('returns 202 when file is rejected without S3 info', async () => {
    payload.form.summaryLogUpload.fileStatus = UPLOAD_STATUS.REJECTED
    delete payload.form.summaryLogUpload.s3Bucket
    delete payload.form.summaryLogUpload.s3Key
    payload.numberOfRejectedFiles = 1

    const response = await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`,
      payload,

      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.ACCEPTED)
  })

  it('returns 202 when file is pending without S3 info', async () => {
    payload.form.summaryLogUpload.fileStatus = UPLOAD_STATUS.PENDING
    delete payload.form.summaryLogUpload.s3Bucket
    delete payload.form.summaryLogUpload.s3Key

    const response = await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/pending-${summaryLogId}/upload-completed`,
      payload,
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.ACCEPTED)
  })

  describe('logging', () => {
    it('should log as expected when uploaded file was accepted', async () => {
      summaryLogsRepository.findById.mockResolvedValueOnce(null)
      summaryLogsRepository.findById.mockResolvedValueOnce({
        version: 1,
        summaryLog: {
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

      await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`,
        payload,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(server.loggerMocks.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: `File upload completed: summaryLogId=${summaryLogId}, fileId=${fileId}, filename=${filename}, status=${fileStatus}, s3Bucket=${s3Bucket}, s3Key=${s3Key}`,
          event: {
            category: 'server',
            action: 'request_success',
            reference: summaryLogId
          }
        })
      )
    })

    it('should log as expected when uploaded file was rejected', async () => {
      payload.form.summaryLogUpload.fileStatus = UPLOAD_STATUS.REJECTED
      delete payload.form.summaryLogUpload.s3Bucket
      delete payload.form.summaryLogUpload.s3Key
      payload.numberOfRejectedFiles = 1

      await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`,
        payload,

        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(server.loggerMocks.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: `File upload completed: summaryLogId=${summaryLogId}, fileId=${fileId}, filename=${filename}, status=${UPLOAD_STATUS.REJECTED}`,
          event: {
            category: 'server',
            action: 'request_success',
            reference: summaryLogId
          }
        })
      )
    })

    it('should log as expected when uploaded file was rejected with a specific error message', async () => {
      payload.form.summaryLogUpload.fileStatus = UPLOAD_STATUS.REJECTED
      payload.form.summaryLogUpload.errorMessage = 'The selected file is empty'
      delete payload.form.summaryLogUpload.s3Bucket
      delete payload.form.summaryLogUpload.s3Key
      payload.numberOfRejectedFiles = 1

      await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`,
        payload,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(summaryLogsRepository.insert).toHaveBeenCalledWith(summaryLogId, {
        status: SUMMARY_LOG_STATUS.REJECTED,
        organisationId,
        registrationId,
        file: {
          id: fileId,
          name: filename,
          status: UPLOAD_STATUS.REJECTED
        },
        validation: {
          failures: [{ code: 'FILE_EMPTY' }]
        }
      })
    })

    it('should log as expected when repository insert fails', async () => {
      const testError = new Error('Database connection failed')
      summaryLogsRepository.insert.mockRejectedValue(testError)

      // Suppress Hapi debug output for this test
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`,
        payload,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      consoleErrorSpy.mockRestore()

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      expect(server.loggerMocks.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: testError,
          message: `Failure on ${summaryLogsUploadCompletedPath}`,
          event: {
            category: 'server',
            action: 'response_failure'
          },
          http: {
            response: {
              status_code: StatusCodes.INTERNAL_SERVER_ERROR
            }
          }
        })
      )
    })

    it('should log an error when a state transition conflict is detected', async () => {
      summaryLogsRepository.findById.mockResolvedValue({
        version: 1,
        summaryLog: {
          status: SUMMARY_LOG_STATUS.VALIDATING,
          file: {
            id: 'existing-file-123',
            name: 'existing.xlsx',
            status: 'complete',
            s3: {
              bucket: 'existing-bucket',
              key: 'existing-key'
            }
          }
        }
      })

      payload.form.summaryLogUpload.fileStatus = UPLOAD_STATUS.PENDING

      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`,
        payload,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      expect(server.loggerMocks.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: `Cannot transition summary log from ${SUMMARY_LOG_STATUS.VALIDATING} to ${SUMMARY_LOG_STATUS.PREPROCESSING}`,
          event: {
            category: 'server',
            action: 'response_failure',
            reference: summaryLogId
          },
          http: {
            response: {
              status_code: StatusCodes.CONFLICT
            }
          }
        })
      )
    })
  })

  describe('state transitions', () => {
    let transitionServer

    beforeAll(async () => {
      const transitionValidator = {
        validate: vi.fn()
      }

      const featureFlags = createInMemoryFeatureFlags({ summaryLogs: true })

      transitionServer = await createTestServer({
        repositories: {
          summaryLogsRepository: createInMemorySummaryLogsRepository()
        },
        workers: {
          summaryLogsWorker: transitionValidator
        },
        featureFlags
      })

      await transitionServer.initialize()
    })

    afterAll(async () => {
      await transitionServer.stop()
    })

    describe('valid transitions (representative samples - exhaustive tests in domain layer)', () => {
      it('allows preprocessing -> preprocessing when receiving multiple pending callbacks', async () => {
        const summaryLogId = 'multi-pending-log-123'

        const firstResponse = await transitionServer.inject({
          method: 'POST',
          url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
          payload: createPendingPayload('file-pending-456'),
          headers: {
            Authorization: `Bearer ${validToken}`
          }
        })

        expect(firstResponse.statusCode).toBe(StatusCodes.ACCEPTED)

        const secondResponse = await transitionServer.inject({
          method: 'POST',
          url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
          payload: createPendingPayload('file-pending-456'),
          headers: {
            Authorization: `Bearer ${validToken}`
          }
        })

        expect(secondResponse.statusCode).toBe(StatusCodes.ACCEPTED)
      })

      it('allows preprocessing -> rejected transition', async () => {
        const summaryLogId = 'preprocessing-to-rejected-123'

        const firstResponse = await transitionServer.inject({
          method: 'POST',
          url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
          payload: createPendingPayload('file-pending-789'),
          headers: {
            Authorization: `Bearer ${validToken}`
          }
        })

        expect(firstResponse.statusCode).toBe(StatusCodes.ACCEPTED)

        const secondResponse = await transitionServer.inject({
          method: 'POST',
          url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
          payload: createRejectedPayload('file-rejected-789'),
          headers: {
            Authorization: `Bearer ${validToken}`
          }
        })

        expect(secondResponse.statusCode).toBe(StatusCodes.ACCEPTED)
      })

      it('allows preprocessing -> validating transition', async () => {
        const summaryLogId = 'preprocessing-to-validating-123'

        const firstResponse = await transitionServer.inject({
          method: 'POST',
          url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
          payload: createPendingPayload('file-pending-101'),
          headers: {
            Authorization: `Bearer ${validToken}`
          }
        })

        expect(firstResponse.statusCode).toBe(StatusCodes.ACCEPTED)

        const secondResponse = await transitionServer.inject({
          method: 'POST',
          url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
          payload: createCompletePayload('file-complete-101'),
          headers: {
            Authorization: `Bearer ${validToken}`
          }
        })

        expect(secondResponse.statusCode).toBe(StatusCodes.ACCEPTED)
      })
    })

    describe('invalid transitions (representative samples - exhaustive tests in domain layer)', () => {
      it('rejects validating -> preprocessing transition', async () => {
        const summaryLogId = 'validating-to-preprocessing-123'

        await transitionServer.inject({
          method: 'POST',
          url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
          payload: createCompletePayload('file-complete-202'),
          headers: {
            Authorization: `Bearer ${validToken}`
          }
        })

        const response = await transitionServer.inject({
          method: 'POST',
          url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
          payload: createPendingPayload('file-pending-202'),
          headers: {
            Authorization: `Bearer ${validToken}`
          }
        })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      })

      it('rejects rejected -> validating transition', async () => {
        const summaryLogId = 'rejected-to-validating-123'

        await transitionServer.inject({
          method: 'POST',
          url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
          payload: createRejectedPayload('file-rejected-505'),
          headers: {
            Authorization: `Bearer ${validToken}`
          }
        })

        const response = await transitionServer.inject({
          method: 'POST',
          url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
          payload: createCompletePayload('file-complete-505'),
          headers: {
            Authorization: `Bearer ${validToken}`
          }
        })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      })
    })
  })
})
