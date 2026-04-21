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

  describe('GET /v1/admin/queues/dlq/status', () => {
    it(
      'returns the actual message count from SQS',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const dlqUrl = await resolveDlqUrl(sqsClient, sqsClient.queueName)

        await sqsClient.send(
          new SendMessageCommand({ QueueUrl: dlqUrl, MessageBody: 'msg1' })
        )

        const server = await createTestServer({
          dlqService: {
            getStatus: async () => {
              const approximateMessageCount = await getApproximateMessageCount(
                sqsClient,
                dlqUrl
              )
              return { approximateMessageCount }
            },
            purge: () => purgeQueue(sqsClient, dlqUrl)
          }
        })

        const response = await server.inject({
          method: 'GET',
          url: '/v1/admin/queues/dlq/status',
          ...asServiceMaintainer()
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(
          JSON.parse(response.payload).approximateMessageCount
        ).toBeGreaterThanOrEqual(1)

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
            getStatus: async () => {
              const approximateMessageCount = await getApproximateMessageCount(
                sqsClient,
                dlqUrl
              )
              return { approximateMessageCount }
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
