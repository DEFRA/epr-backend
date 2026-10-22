import { beforeAll, describe, expect, it } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { reprocessor } from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import { partialMock } from '#test/type-helpers.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

const { buildOrganisation } = createOrganisationBuilders()

const organisation = buildOrganisation({
  registrations: [reprocessor({ id: 'reg-456' })]
})
const organisationId = organisation.id

const buildPostUrl = (summaryLogId) =>
  `/organisations/${organisation.orgId}/registrations/${organisation.registrations[0].registrationNumber}/summary-logs/2026/${summaryLogId}/upload-completed`

describe('POST upload-completed validation', () => {
  // Mock OIDC servers needed for server startup, but we inject credentials directly
  setupAuthContext()

  let server

  beforeAll(async () => {
    server = await createTestServer({
      repositories: {
        summaryLogsRepository: createInMemorySummaryLogsRepository(),
        organisationsRepository: createInMemoryOrganisationsRepository([
          partialMock(organisation)
        ])
      }
    })
  })

  it('rejects payload without form object', async () => {
    const response = await server.inject({
      method: 'POST',
      url: buildPostUrl('sum-789'),
      payload: {
        metadata: { organisationId }
      }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(response.result.message).toContain('"form" is required')
  })

  it('rejects payload without form.summaryLogUpload', async () => {
    const response = await server.inject({
      method: 'POST',
      url: buildPostUrl('sum-789'),
      payload: {
        form: {
          notFile: 'wrong'
        }
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
      url: buildPostUrl('sum-789'),
      payload: {
        form: {
          summaryLogUpload: {
            filename: 'test.xlsx',
            fileStatus: 'complete',
            s3Bucket: 'bucket',
            s3Key: 'key'
          }
        }
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
      url: buildPostUrl('sum-789'),
      payload: {
        form: {
          summaryLogUpload: {
            fileId: 'file-123',
            fileStatus: 'complete',
            s3Bucket: 'bucket',
            s3Key: 'key'
          }
        }
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
      url: buildPostUrl('sum-789'),
      payload: {
        form: {
          summaryLogUpload: {
            fileId: 'file-123',
            filename: 'test.xlsx',
            s3Bucket: 'bucket',
            s3Key: 'key'
          }
        }
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
      url: buildPostUrl('sum-789'),
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
      url: buildPostUrl('sum-789'),
      payload: {
        form: {
          summaryLogUpload: {
            fileId: 'file-123',
            filename: 'test.xlsx',
            fileStatus: 'complete',
            s3Key: 'key'
          }
        }
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
      url: buildPostUrl('sum-789'),
      payload: {
        form: {
          summaryLogUpload: {
            fileId: 'file-123',
            filename: 'test.xlsx',
            fileStatus: 'complete',
            s3Bucket: 'bucket'
          }
        }
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
      url: buildPostUrl('sum-789'),
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
      }
    })

    expect(response.statusCode).toBe(StatusCodes.ACCEPTED)
  })

  it('accepts valid payload with rejected status', async () => {
    const response = await server.inject({
      method: 'POST',
      url: buildPostUrl('sum-999'),
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
      }
    })

    expect(response.statusCode).toBe(StatusCodes.ACCEPTED)
  })

  it('accepts payload with extra unknown fields in form.summaryLogUpload', async () => {
    const response = await server.inject({
      method: 'POST',
      url: buildPostUrl('sum-888'),
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
      }
    })

    expect(response.statusCode).toBe(StatusCodes.ACCEPTED)
  })

  it('accepts payload with extra unknown fields at top level', async () => {
    const response = await server.inject({
      method: 'POST',
      url: buildPostUrl('sum-777'),
      payload: {
        uploadStatus: 'ready',
        metadata: {
          organisationId,
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
      }
    })

    expect(response.statusCode).toBe(StatusCodes.ACCEPTED)
  })
})
