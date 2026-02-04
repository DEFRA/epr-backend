import { describe, expect, vi, beforeEach } from 'vitest'
import { GetQueueUrlCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs'
import { it } from '#vite/fixtures/sqs.js'
import { createSqsCommandExecutor } from './sqs-command-executor.js'

/**
 * Integration tests for SQS command executor.
 *
 * These tests verify that the executor correctly sends messages to an SQS queue
 * (via LocalStack). They focus on:
 * - Queue URL resolution
 * - Message format and content
 * - User context serialisation
 * - Error handling when queue doesn't exist
 *
 * The message handling is tested in the consumer integration tests.
 */
describe('SQS command executor integration', () => {
  let logger

  beforeEach(() => {
    logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    }
  })

  describe('validate', () => {
    it(
      'sends validate command message to queue',
      { timeout: 15000 },
      async ({ sqsClient }) => {
        const executor = await createSqsCommandExecutor({
          sqsClient,
          queueName: sqsClient.queueName,
          logger
        })

        const summaryLogId = `validate-test-${Date.now()}`
        await executor.validate(summaryLogId)

        // Verify message was sent by receiving it from the queue
        const { QueueUrl: queueUrl } = await sqsClient.send(
          new GetQueueUrlCommand({ QueueName: sqsClient.queueName })
        )

        const response = await sqsClient.send(
          new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            WaitTimeSeconds: 5
          })
        )

        expect(response.Messages).toHaveLength(1)

        const message = JSON.parse(response.Messages[0].Body)
        expect(message).toEqual({
          command: 'validate',
          summaryLogId
        })
      }
    )

    it(
      'logs message send success',
      { timeout: 15000 },
      async ({ sqsClient }) => {
        const executor = await createSqsCommandExecutor({
          sqsClient,
          queueName: sqsClient.queueName,
          logger
        })

        const summaryLogId = 'log-test-123'
        await executor.validate(summaryLogId)

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining(
              `Sent validate command for summaryLogId=${summaryLogId}`
            )
          })
        )
      }
    )
  })

  describe('submit', () => {
    it(
      'sends submit command message to queue',
      { timeout: 15000 },
      async ({ sqsClient }) => {
        const executor = await createSqsCommandExecutor({
          sqsClient,
          queueName: sqsClient.queueName,
          logger
        })

        const summaryLogId = `submit-test-${Date.now()}`
        await executor.submit(summaryLogId)

        // Verify message was sent by receiving it from the queue
        const { QueueUrl: queueUrl } = await sqsClient.send(
          new GetQueueUrlCommand({ QueueName: sqsClient.queueName })
        )

        const response = await sqsClient.send(
          new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            WaitTimeSeconds: 5
          })
        )

        expect(response.Messages).toHaveLength(1)

        const message = JSON.parse(response.Messages[0].Body)
        expect(message).toEqual({
          command: 'submit',
          summaryLogId
        })
      }
    )

    it(
      'includes user context in submit message when request has credentials',
      { timeout: 15000 },
      async ({ sqsClient }) => {
        const executor = await createSqsCommandExecutor({
          sqsClient,
          queueName: sqsClient.queueName,
          logger
        })

        const summaryLogId = `submit-user-test-${Date.now()}`
        const mockRequest = {
          auth: {
            credentials: {
              id: 'user-123',
              email: 'test@example.com',
              scope: ['admin']
            }
          }
        }

        await executor.submit(summaryLogId, mockRequest)

        const { QueueUrl: queueUrl } = await sqsClient.send(
          new GetQueueUrlCommand({ QueueName: sqsClient.queueName })
        )

        const response = await sqsClient.send(
          new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            WaitTimeSeconds: 5
          })
        )

        expect(response.Messages).toHaveLength(1)

        const message = JSON.parse(response.Messages[0].Body)
        expect(message).toEqual({
          command: 'submit',
          summaryLogId,
          user: {
            id: 'user-123',
            email: 'test@example.com',
            scope: ['admin']
          }
        })
      }
    )

    it(
      'logs message send success',
      { timeout: 15000 },
      async ({ sqsClient }) => {
        const executor = await createSqsCommandExecutor({
          sqsClient,
          queueName: sqsClient.queueName,
          logger
        })

        const summaryLogId = 'submit-log-456'
        await executor.submit(summaryLogId)

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining(
              `Sent submit command for summaryLogId=${summaryLogId}`
            )
          })
        )
      }
    )
  })

  describe('queue connection', () => {
    it(
      'resolves queue URL and logs it',
      { timeout: 15000 },
      async ({ sqsClient }) => {
        await createSqsCommandExecutor({
          sqsClient,
          queueName: sqsClient.queueName,
          logger
        })

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('Resolved queue URL')
          })
        )
      }
    )

    it(
      'throws when queue does not exist',
      { timeout: 15000 },
      async ({ sqsClient }) => {
        await expect(
          createSqsCommandExecutor({
            sqsClient,
            queueName: 'nonexistent-queue',
            logger
          })
        ).rejects.toThrow()
      }
    )
  })
})
