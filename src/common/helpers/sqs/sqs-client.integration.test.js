import { describe, expect } from 'vitest'
import { SendMessageCommand } from '@aws-sdk/client-sqs'
import { it } from '#vite/fixtures/sqs.js'
import {
  resolveDlqUrl,
  getApproximateMessageCount,
  purgeQueue
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

  describe('purgeQueue', () => {
    it(
      'purges messages and returns successfully',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const dlqUrl = await resolveDlqUrl(sqsClient, sqsClient.queueName)

        await sqsClient.send(
          new SendMessageCommand({ QueueUrl: dlqUrl, MessageBody: 'msg1' })
        )

        await expect(purgeQueue(sqsClient, dlqUrl)).resolves.not.toThrow()
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
