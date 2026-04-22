import { describe, expect } from 'vitest'
import { SendMessageCommand } from '@aws-sdk/client-sqs'
import { it } from '#vite/fixtures/sqs.js'
import {
  resolveDlqUrl,
  getApproximateMessageCount,
  purgeQueue,
  receiveMessages
} from './sqs-client.js'

const TEST_TIMEOUT = 30000

describe('SQS client DLQ helpers', () => {
  describe('resolveDlqUrl', () => {
    it(
      'resolves the DLQ URL from the main queue name',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const dlqUrl = await resolveDlqUrl(sqsClient, sqsClient.queueName)

        expect(dlqUrl).toContain(sqsClient.dlqName)
      }
    )

    it(
      'throws when the main queue does not exist',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        await expect(
          resolveDlqUrl(sqsClient, 'nonexistent-queue')
        ).rejects.toThrow()
      }
    )

    it(
      'throws when the main queue has no redrive policy',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        // The DLQ itself has no redrive policy
        await expect(
          resolveDlqUrl(sqsClient, sqsClient.dlqName)
        ).rejects.toThrow('No redrive policy found')
      }
    )
  })

  describe('getApproximateMessageCount', () => {
    it(
      'returns 0 for an empty queue',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const dlqUrl = await resolveDlqUrl(sqsClient, sqsClient.queueName)
        const count = await getApproximateMessageCount(sqsClient, dlqUrl)

        expect(count).toBe(0)
      }
    )

    it(
      'returns a number (not a string)',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const dlqUrl = await resolveDlqUrl(sqsClient, sqsClient.queueName)
        const count = await getApproximateMessageCount(sqsClient, dlqUrl)

        expect(typeof count).toBe('number')
      }
    )

    it(
      'reflects messages sent to the queue',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const dlqUrl = await resolveDlqUrl(sqsClient, sqsClient.queueName)

        await sqsClient.send(
          new SendMessageCommand({ QueueUrl: dlqUrl, MessageBody: 'test' })
        )

        const count = await getApproximateMessageCount(sqsClient, dlqUrl)

        expect(count).toBeGreaterThanOrEqual(1)
      }
    )
  })

  describe('receiveMessages', () => {
    it(
      'returns an empty array for an empty queue',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const dlqUrl = await resolveDlqUrl(sqsClient, sqsClient.queueName)

        const messages = await receiveMessages(sqsClient, dlqUrl)

        expect(messages).toEqual([])
      }
    )

    it(
      'returns messages with correct shape',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const dlqUrl = await resolveDlqUrl(sqsClient, sqsClient.queueName)

        await sqsClient.send(
          new SendMessageCommand({
            QueueUrl: dlqUrl,
            MessageBody: '{"type":"TEST_COMMAND"}'
          })
        )

        const messages = await receiveMessages(sqsClient, dlqUrl)

        expect(messages).toHaveLength(1)
        expect(messages[0]).toEqual(
          expect.objectContaining({
            messageId: expect.any(String),
            sentTimestamp: expect.any(String),
            approximateReceiveCount: expect.any(Number),
            body: '{"type":"TEST_COMMAND"}'
          })
        )
      }
    )

    it(
      'returns a valid ISO 8601 sentTimestamp',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const dlqUrl = await resolveDlqUrl(sqsClient, sqsClient.queueName)

        await sqsClient.send(
          new SendMessageCommand({ QueueUrl: dlqUrl, MessageBody: 'test' })
        )

        const messages = await receiveMessages(sqsClient, dlqUrl)

        expect(new Date(messages[0].sentTimestamp).toISOString()).toBe(
          messages[0].sentTimestamp
        )
      }
    )

    it(
      'returns each message once even when VisibilityTimeout: 0 causes re-delivery',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const dlqUrl = await resolveDlqUrl(sqsClient, sqsClient.queueName)

        await Promise.all(
          Array.from({ length: 3 }, (_, i) =>
            sqsClient.send(
              new SendMessageCommand({
                QueueUrl: dlqUrl,
                MessageBody: `msg-${i}`
              })
            )
          )
        )

        const messages = await receiveMessages(sqsClient, dlqUrl, {
          maxMessages: 100
        })

        const uniqueIds = new Set(messages.map((m) => m.messageId))
        expect(uniqueIds.size).toBe(3)
      }
    )

    it(
      'respects the maxMessages cap',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const dlqUrl = await resolveDlqUrl(sqsClient, sqsClient.queueName)

        await Promise.all(
          Array.from({ length: 5 }, (_, i) =>
            sqsClient.send(
              new SendMessageCommand({
                QueueUrl: dlqUrl,
                MessageBody: `msg-${i}`
              })
            )
          )
        )

        const messages = await receiveMessages(sqsClient, dlqUrl, {
          maxMessages: 3
        })

        expect(messages.length).toBeLessThanOrEqual(3)
      }
    )
  })

  describe('purgeQueue', () => {
    it(
      'purges messages so the queue is empty',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const dlqUrl = await resolveDlqUrl(sqsClient, sqsClient.queueName)

        await sqsClient.send(
          new SendMessageCommand({ QueueUrl: dlqUrl, MessageBody: 'msg1' })
        )

        await purgeQueue(sqsClient, dlqUrl)

        const count = await getApproximateMessageCount(sqsClient, dlqUrl)
        expect(count).toBe(0)
      }
    )

    it(
      'can purge an already empty queue without error',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const dlqUrl = await resolveDlqUrl(sqsClient, sqsClient.queueName)

        await expect(purgeQueue(sqsClient, dlqUrl)).resolves.not.toThrow()
      }
    )
  })
})
