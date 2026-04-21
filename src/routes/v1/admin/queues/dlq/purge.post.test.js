import { StatusCodes } from 'http-status-codes'
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest'

import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer, asStandardUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

const DLQ_PURGE_PATH = '/v1/admin/queues/dlq/purge'

describe('POST /v1/admin/queues/dlq/purge', () => {
  setupAuthContext()

  let server

  beforeAll(async () => {
    server = await createTestServer({
      dlqService: {
        getStatus: vi.fn(),
        purge: vi.fn().mockResolvedValue(undefined)
      }
    })
  })

  afterAll(async () => {
    await server.stop()
  })

  it('returns 200 with purged: true for service maintainer', async () => {
    const response = await server.inject({
      method: 'POST',
      url: DLQ_PURGE_PATH,
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toStrictEqual({ purged: true })
  })

  it('returns 401 when not authenticated', async () => {
    const response = await server.inject({
      method: 'POST',
      url: DLQ_PURGE_PATH
    })

    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
  })

  it('returns 403 when authenticated as standard user', async () => {
    const response = await server.inject({
      method: 'POST',
      url: DLQ_PURGE_PATH,
      ...asStandardUser({ linkedOrgId: 'org-123' })
    })

    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
  })
})

describe('POST /v1/admin/queues/dlq/purge — service failure', () => {
  setupAuthContext()

  let server

  beforeAll(async () => {
    server = await createTestServer({
      dlqService: {
        getStatus: vi.fn(),
        purge: vi.fn().mockRejectedValue(new Error('SQS unavailable'))
      }
    })
  })

  afterAll(async () => {
    await server.stop()
  })

  it('returns 500 when dlqService throws', async () => {
    const response = await server.inject({
      method: 'POST',
      url: DLQ_PURGE_PATH,
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
  })
})
