import { StatusCodes } from 'http-status-codes'
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest'

import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer, asStandardUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

const DLQ_STATUS_PATH = '/v1/admin/queues/dlq/status'

describe('GET /v1/admin/queues/dlq/status', () => {
  setupAuthContext()

  let server

  beforeAll(async () => {
    server = await createTestServer({
      dlqService: {
        getStatus: vi.fn().mockResolvedValue({ approximateMessageCount: 3 }),
        purge: vi.fn()
      }
    })
  })

  afterAll(async () => {
    await server.stop()
  })

  it('returns 401 when not authenticated', async () => {
    const response = await server.inject({
      method: 'GET',
      url: DLQ_STATUS_PATH
    })

    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
  })

  it('returns 403 when authenticated as standard user', async () => {
    const response = await server.inject({
      method: 'GET',
      url: DLQ_STATUS_PATH,
      ...asStandardUser({ linkedOrgId: 'org-123' })
    })

    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
  })
})

describe('GET /v1/admin/queues/dlq/status — service failure', () => {
  setupAuthContext()

  let server

  beforeAll(async () => {
    server = await createTestServer({
      dlqService: {
        getStatus: vi.fn().mockRejectedValue(new Error('SQS unavailable')),
        purge: vi.fn()
      }
    })
  })

  afterAll(async () => {
    await server.stop()
  })

  it('returns 500 when dlqService throws', async () => {
    const response = await server.inject({
      method: 'GET',
      url: DLQ_STATUS_PATH,
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
  })
})
