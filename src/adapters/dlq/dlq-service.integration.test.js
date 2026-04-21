import { describe, expect } from 'vitest'
import { SendMessageCommand } from '@aws-sdk/client-sqs'
import { it } from '#vite/fixtures/sqs.js'
import { getDlqUrl, getDlqStatus, purgeDlq } from './dlq-service.js'

const TEST_TIMEOUT = 30000

describe('DLQ service integration', () => {
  describe('getDlqUrl', () => {
    it(
      'resolves the DLQ URL from the main queue name',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const dlqUrl = await getDlqUrl(sqsClient, sqsClient.queueName)

        expect(dlqUrl).toContain(sqsClient.dlqName)
      }
    )

    it(
      'throws when the main queue does not exist',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        await expect(
          getDlqUrl(sqsClient, 'nonexistent-queue')
        ).rejects.toThrow()
      }
    )

    it(
      'throws when the main queue has no redrive policy',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        // The DLQ itself has no redrive policy — use it as the "main queue"
        await expect(getDlqUrl(sqsClient, sqsClient.dlqName)).rejects.toThrow(
          'No redrive policy found'
        )
      }
    )
  })

  describe('getDlqStatus', () => {
    it(
      'returns approximateMessageCount of 0 for an empty DLQ',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const dlqUrl = await getDlqUrl(sqsClient, sqsClient.queueName)
        const status = await getDlqStatus(sqsClient, dlqUrl)

        expect(status).toStrictEqual({ approximateMessageCount: 0 })
      }
    )

    it(
      'returns approximateMessageCount as a number (not a string)',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const dlqUrl = await getDlqUrl(sqsClient, sqsClient.queueName)
        const status = await getDlqStatus(sqsClient, dlqUrl)

        expect(typeof status.approximateMessageCount).toBe('number')
      }
    )

    it(
      'reflects messages sent directly to the DLQ',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const dlqUrl = await getDlqUrl(sqsClient, sqsClient.queueName)

        await sqsClient.send(
          new SendMessageCommand({ QueueUrl: dlqUrl, MessageBody: 'test' })
        )

        const status = await getDlqStatus(sqsClient, dlqUrl)

        expect(status.approximateMessageCount).toBeGreaterThanOrEqual(1)
      }
    )
  })

  describe('purgeDlq', () => {
    it(
      'purges messages from the DLQ and returns successfully',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const dlqUrl = await getDlqUrl(sqsClient, sqsClient.queueName)

        await sqsClient.send(
          new SendMessageCommand({ QueueUrl: dlqUrl, MessageBody: 'msg1' })
        )

        await expect(purgeDlq(sqsClient, dlqUrl)).resolves.not.toThrow()
      }
    )

    it(
      'can purge an already empty DLQ without error',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const dlqUrl = await getDlqUrl(sqsClient, sqsClient.queueName)

        await expect(purgeDlq(sqsClient, dlqUrl)).resolves.not.toThrow()
      }
    )
  })
})
