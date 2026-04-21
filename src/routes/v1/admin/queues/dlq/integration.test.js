import { describe, expect } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { SendMessageCommand } from '@aws-sdk/client-sqs'
import { it } from '#vite/fixtures/sqs.js'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer } from '#test/inject-auth.js'
import { createMockOidcServers } from '#vite/helpers/mock-oidc-servers.js'
import {
  resolveDlqUrl,
  getApproximateMessageCount,
  receiveMessages,
  purgeQueue
} from '#common/helpers/sqs/sqs-client.js'

const TEST_TIMEOUT = 30000

describe('DLQ admin routes — real SQS', () => {
  let mockOidcServer

  beforeAll(() => {
    mockOidcServer = createMockOidcServers()
    mockOidcServer.listen({ onUnhandledRequest: 'warn' })
  })

  afterEach(() => {
    mockOidcServer?.resetHandlers()
  })

  afterAll(() => {
    mockOidcServer?.close()
  })

  describe('GET /v1/admin/queues/dlq/messages', () => {
    it(
      'returns messages from the DLQ',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const dlqUrl = await resolveDlqUrl(sqsClient, sqsClient.queueName)
        const messageBody = JSON.stringify({
          type: 'SUMMARY_LOG_COMMAND.VALIDATE',
          payload: { summaryLogId: 'log-1' }
        })

        await sqsClient.send(
          new SendMessageCommand({ QueueUrl: dlqUrl, MessageBody: messageBody })
        )

        const server = await createTestServer({
          dlqService: {
            getMessages: async () => {
              const [approximateMessageCount, rawMessages] = await Promise.all([
                getApproximateMessageCount(sqsClient, dlqUrl),
                receiveMessages(sqsClient, dlqUrl)
              ])

              const messages = rawMessages.map((msg) => {
                let command = null
                try {
                  command = JSON.parse(msg.body)
                } catch {
                  // leave command as null
                }
                return { ...msg, command }
              })

              return { approximateMessageCount, messages }
            },
            purge: () => purgeQueue(sqsClient, dlqUrl)
          }
        })

        const response = await server.inject({
          method: 'GET',
          url: '/v1/admin/queues/dlq/messages',
          ...asServiceMaintainer()
        })

        expect(response.statusCode).toBe(StatusCodes.OK)

        const payload = JSON.parse(response.payload)
        // approximateMessageCount is eventually consistent in SQS,
        // so we only check it is a non-negative number
        expect(payload.approximateMessageCount).toBeGreaterThanOrEqual(0)
        expect(payload.messages).toHaveLength(1)
        expect(payload.messages[0]).toEqual(
          expect.objectContaining({
            messageId: expect.any(String),
            sentTimestamp: expect.any(String),
            approximateReceiveCount: expect.any(Number),
            command: {
              type: 'SUMMARY_LOG_COMMAND.VALIDATE',
              payload: { summaryLogId: 'log-1' }
            },
            body: messageBody
          })
        )

        await server.stop()
      }
    )

    it(
      'returns empty messages array when DLQ is empty',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const dlqUrl = await resolveDlqUrl(sqsClient, sqsClient.queueName)

        const server = await createTestServer({
          dlqService: {
            getMessages: async () => {
              const [approximateMessageCount, rawMessages] = await Promise.all([
                getApproximateMessageCount(sqsClient, dlqUrl),
                receiveMessages(sqsClient, dlqUrl)
              ])

              return { approximateMessageCount, messages: rawMessages }
            },
            purge: () => purgeQueue(sqsClient, dlqUrl)
          }
        })

        const response = await server.inject({
          method: 'GET',
          url: '/v1/admin/queues/dlq/messages',
          ...asServiceMaintainer()
        })

        expect(response.statusCode).toBe(StatusCodes.OK)

        const payload = JSON.parse(response.payload)
        expect(payload.approximateMessageCount).toBe(0)
        expect(payload.messages).toEqual([])

        await server.stop()
      }
    )
  })

  describe('POST /v1/admin/queues/dlq/purge', () => {
    it(
      'purges messages and returns purged: true',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const dlqUrl = await resolveDlqUrl(sqsClient, sqsClient.queueName)

        await sqsClient.send(
          new SendMessageCommand({ QueueUrl: dlqUrl, MessageBody: 'msg1' })
        )

        const server = await createTestServer({
          dlqService: {
            getMessages: async () => {
              const approximateMessageCount = await getApproximateMessageCount(
                sqsClient,
                dlqUrl
              )
              return { approximateMessageCount, messages: [] }
            },
            purge: () => purgeQueue(sqsClient, dlqUrl)
          }
        })

        const response = await server.inject({
          method: 'POST',
          url: '/v1/admin/queues/dlq/purge',
          ...asServiceMaintainer()
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(JSON.parse(response.payload)).toStrictEqual({ purged: true })

        const count = await getApproximateMessageCount(sqsClient, dlqUrl)
        expect(count).toBe(0)

        await server.stop()
      }
    )
  })
})
