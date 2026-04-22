import { StatusCodes } from 'http-status-codes'
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest'

import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer, asStandardUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

const DLQ_MESSAGES_PATH = '/v1/admin/queues/dlq/messages'

describe('GET /v1/admin/queues/dlq/messages', () => {
  setupAuthContext()

  let server

  beforeAll(async () => {
    server = await createTestServer({
      dlqService: {
        getMessages: vi.fn().mockResolvedValue({
          approximateMessageCount: 1,
          messages: [
            {
              messageId: 'abc-123',
              sentTimestamp: '2026-04-21T10:30:00.000Z',
              approximateReceiveCount: 4,
              command: { type: 'SUMMARY_LOG_COMMAND.VALIDATE' },
              body: '{"type":"SUMMARY_LOG_COMMAND.VALIDATE"}'
            }
          ]
        }),
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
      url: DLQ_MESSAGES_PATH
    })

    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
  })

  it('returns 403 when authenticated as standard user', async () => {
    const response = await server.inject({
      method: 'GET',
      url: DLQ_MESSAGES_PATH,
      ...asStandardUser({ linkedOrgId: 'org-123' })
    })

    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
  })

  it('returns messages from the DLQ', async () => {
    const response = await server.inject({
      method: 'GET',
      url: DLQ_MESSAGES_PATH,
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)

    const payload = JSON.parse(response.payload)
    expect(payload.approximateMessageCount).toBe(1)
    expect(payload.messages).toHaveLength(1)
    expect(payload.messages[0]).toEqual(
      expect.objectContaining({
        messageId: 'abc-123',
        sentTimestamp: '2026-04-21T10:30:00.000Z',
        approximateReceiveCount: 4,
        command: { type: 'SUMMARY_LOG_COMMAND.VALIDATE' },
        body: '{"type":"SUMMARY_LOG_COMMAND.VALIDATE"}'
      })
    )
  })
})

describe('GET /v1/admin/queues/dlq/messages — empty queue', () => {
  setupAuthContext()

  let server

  beforeAll(async () => {
    server = await createTestServer({
      dlqService: {
        getMessages: vi.fn().mockResolvedValue({
          approximateMessageCount: 0,
          messages: []
        }),
        purge: vi.fn()
      }
    })
  })

  afterAll(async () => {
    await server.stop()
  })

  it('returns empty messages array', async () => {
    const response = await server.inject({
      method: 'GET',
      url: DLQ_MESSAGES_PATH,
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)

    const payload = JSON.parse(response.payload)
    expect(payload.approximateMessageCount).toBe(0)
    expect(payload.messages).toEqual([])
  })
})

describe('GET /v1/admin/queues/dlq/messages — service failure', () => {
  setupAuthContext()

  let server

  beforeAll(async () => {
    server = await createTestServer({
      dlqService: {
        getMessages: vi.fn().mockRejectedValue(new Error('SQS unavailable')),
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
      url: DLQ_MESSAGES_PATH,
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
  })
})
