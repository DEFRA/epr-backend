import { beforeAll, describe, expect, it } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createServer } from '#server/server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { defraIdMockAuthTokens } from '#vite/helpers/create-defra-id-test-tokens.js'
import { buildActiveOrg } from '#vite/helpers/build-active-org.js'

const { validToken } = defraIdMockAuthTokens

const buildPostUrl = (organisationId, registrationId, summaryLogId) =>
  `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`

describe('POST upload-completed validation', () => {
  let org
  let server
  let organisationsRepositoryFactory
  let organisationsRepository
  setupAuthContext()

  beforeAll(async () => {
    organisationsRepositoryFactory = createInMemoryOrganisationsRepository([])
    organisationsRepository = organisationsRepositoryFactory()
    server = await createServer({
      skipMongoDb: true,
      repositories: {
        summaryLogsRepository: createInMemorySummaryLogsRepository(),
        organisationsRepository: organisationsRepositoryFactory
      },
      featureFlags: createInMemoryFeatureFlags({ summaryLogs: true })
    })
    await server.initialize()

    org = await buildActiveOrg(organisationsRepository)
  })

  it('rejects payload without form object', async () => {
    const response = await server.inject({
      method: 'POST',
      url: buildPostUrl(org.id, 'reg-456', 'sum-789'),
      payload: {
        metadata: { organisationId: org.id }
      },
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(response.result.message).toContain('"form" is required')
  })

  it('rejects payload without form.summaryLogUpload', async () => {
    const response = await server.inject({
      method: 'POST',
      url: buildPostUrl(org.id, 'reg-456', 'sum-789'),
      payload: {
        form: {
          notFile: 'wrong'
        }
      },
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(response.result.message).toContain(
      '"form.summaryLogUpload" is required'
    )
  })

  it('rejects payload with missing fileId', async () => {
    const response = await server.inject({
      method: 'POST',
      url: buildPostUrl(org.id, 'reg-456', 'sum-789'),
      payload: {
        form: {
          summaryLogUpload: {
            filename: 'test.xlsx',
            fileStatus: 'complete',
            s3Bucket: 'bucket',
            s3Key: 'key'
          }
        }
      },
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(response.result.message).toContain(
      '"form.summaryLogUpload.fileId" is required'
    )
  })

  it('rejects payload with missing filename', async () => {
    const response = await server.inject({
      method: 'POST',
      url: buildPostUrl(org.id, 'reg-456', 'sum-789'),
      payload: {
        form: {
          summaryLogUpload: {
            fileId: 'file-123',
            fileStatus: 'complete',
            s3Bucket: 'bucket',
            s3Key: 'key'
          }
        }
      },
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(response.result.message).toContain(
      '"form.summaryLogUpload.filename" is required'
    )
  })

  it('rejects payload with missing fileStatus', async () => {
    const response = await server.inject({
      method: 'POST',
      url: buildPostUrl(org.id, 'reg-456', 'sum-789'),
      payload: {
        form: {
          summaryLogUpload: {
            fileId: 'file-123',
            filename: 'test.xlsx',
            s3Bucket: 'bucket',
            s3Key: 'key'
          }
        }
      },
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(response.result.message).toContain(
      '"form.summaryLogUpload.fileStatus" is required'
    )
  })

  it('rejects payload with invalid fileStatus', async () => {
    const response = await server.inject({
      method: 'POST',
      url: buildPostUrl(org.id, 'reg-456', 'sum-789'),
      payload: {
        form: {
          summaryLogUpload: {
            fileId: 'file-123',
            filename: 'test.xlsx',
            fileStatus: 'invalid-status',
            s3Bucket: 'bucket',
            s3Key: 'key'
          }
        }
      },
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(response.result.message).toContain(
      '"form.summaryLogUpload.fileStatus" must be one of [complete, rejected, pending]'
    )
  })

  it('rejects payload with missing s3Bucket', async () => {
    const response = await server.inject({
      method: 'POST',
      url: buildPostUrl(org.id, 'reg-456', 'sum-789'),
      payload: {
        form: {
          summaryLogUpload: {
            fileId: 'file-123',
            filename: 'test.xlsx',
            fileStatus: 'complete',
            s3Key: 'key'
          }
        }
      },
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(response.result.message).toContain(
      '"form.summaryLogUpload.s3Bucket" is required'
    )
  })

  it('rejects payload with missing s3Key', async () => {
    const response = await server.inject({
      method: 'POST',
      url: buildPostUrl(org.id, 'reg-456', 'sum-789'),
      payload: {
        form: {
          summaryLogUpload: {
            fileId: 'file-123',
            filename: 'test.xlsx',
            fileStatus: 'complete',
            s3Bucket: 'bucket'
          }
        }
      },
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(response.result.message).toContain(
      '"form.summaryLogUpload.s3Key" is required'
    )
  })

  it('accepts valid payload with complete status', async () => {
    const response = await server.inject({
      method: 'POST',
      url: buildPostUrl(org.id, 'reg-456', 'sum-789'),
      payload: {
        form: {
          summaryLogUpload: {
            fileId: 'file-123',
            filename: 'test.xlsx',
            fileStatus: 'complete',
            s3Bucket: 'bucket',
            s3Key: 'key'
          }
        }
      },
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.ACCEPTED)
  })

  it('accepts valid payload with rejected status', async () => {
    const response = await server.inject({
      method: 'POST',
      url: buildPostUrl(org.id, 'reg-456', 'sum-999'),
      payload: {
        form: {
          summaryLogUpload: {
            fileId: 'file-999',
            filename: 'virus.xlsx',
            fileStatus: 'rejected',
            s3Bucket: 'bucket',
            s3Key: 'key'
          }
        }
      },
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.ACCEPTED)
  })

  it('accepts payload with extra unknown fields in form.summaryLogUpload', async () => {
    const response = await server.inject({
      method: 'POST',
      url: buildPostUrl(org.id, 'reg-456', 'sum-888'),
      payload: {
        form: {
          summaryLogUpload: {
            fileId: 'file-888',
            filename: 'test.xlsx',
            fileStatus: 'complete',
            s3Bucket: 'bucket',
            s3Key: 'key',
            contentType: 'application/xlsx',
            contentLength: 12345,
            checksumSha256: 'abc123'
          }
        }
      },
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.ACCEPTED)
  })

  it('accepts payload with extra unknown fields at top level', async () => {
    const response = await server.inject({
      method: 'POST',
      url: buildPostUrl(org.id, 'reg-456', 'sum-777'),
      payload: {
        uploadStatus: 'ready',
        metadata: {
          organisationId: 'org-123',
          registrationId: 'reg-456'
        },
        form: {
          summaryLogUpload: {
            fileId: 'file-777',
            filename: 'test.xlsx',
            fileStatus: 'complete',
            s3Bucket: 'bucket',
            s3Key: 'key'
          }
        },
        numberOfRejectedFiles: 0
      },
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.ACCEPTED)
  })
})
