import { describe, expect, vi, beforeEach } from 'vitest'
import { GetQueueUrlCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs'
import { getTraceId } from '@defra/hapi-tracing'
import { it } from '#vite/fixtures/sqs.js'
import { createSqsCommandExecutor } from './sqs-command-executor.js'

vi.mock(import('@defra/hapi-tracing'), () => ({
  getTraceId: vi.fn(() => null),
  tracing: { plugin: {} }
}))

const TEST_TIMEOUT = 30000

/**
 * Integration tests for SQS command executor.
 *
 * These tests verify that the executor correctly sends messages to an SQS queue
 * (via Floci). They focus on:
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
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const executor = await createSqsCommandExecutor({
          sqsClient,
          queueName: sqsClient.queueName,
          logger
        })

        const summaryLogId = `validate-test-${Date.now()}`
        await executor.summaryLogsWorker.validate(summaryLogId)

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
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const executor = await createSqsCommandExecutor({
          sqsClient,
          queueName: sqsClient.queueName,
          logger
        })

        const summaryLogId = 'log-test-123'
        await executor.summaryLogsWorker.validate(summaryLogId)

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
    const mockRequest = {
      auth: {
        credentials: {
          id: 'user-123',
          email: 'test@example.com',
          scope: ['admin']
        }
      }
    }

    it(
      'sends submit command message to queue with user context',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const executor = await createSqsCommandExecutor({
          sqsClient,
          queueName: sqsClient.queueName,
          logger
        })

        const summaryLogId = `submit-user-test-${Date.now()}`
        await executor.summaryLogsWorker.submit(summaryLogId, mockRequest)

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
      'rejects machine credentials at the boundary',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const executor = await createSqsCommandExecutor({
          sqsClient,
          queueName: sqsClient.queueName,
          logger
        })

        const machineRequest = {
          auth: {
            credentials: {
              id: 'machine-1',
              isMachine: true,
              name: 'machine-1'
            }
          }
        }

        await expect(
          executor.summaryLogsWorker.submit(
            `submit-machine-${Date.now()}`,
            machineRequest
          )
        ).rejects.toThrow(
          /Machine credentials cannot drive a summary-log submit/
        )
      }
    )

    it(
      'logs message send success',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const executor = await createSqsCommandExecutor({
          sqsClient,
          queueName: sqsClient.queueName,
          logger
        })

        const summaryLogId = 'submit-log-456'
        await executor.summaryLogsWorker.submit(summaryLogId, mockRequest)

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

  describe('importOverseasSites', () => {
    it(
      'sends import-overseas-sites command message to queue',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const executor = await createSqsCommandExecutor({
          sqsClient,
          queueName: sqsClient.queueName,
          logger
        })

        const importId = `import-test-${Date.now()}`
        await executor.orsImportsWorker.importOverseasSites(importId)

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
          command: 'import-overseas-sites',
          importId
        })
      }
    )

    it(
      'includes user context in import message when provided',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const executor = await createSqsCommandExecutor({
          sqsClient,
          queueName: sqsClient.queueName,
          logger
        })

        const importId = `import-user-test-${Date.now()}`
        const user = {
          id: 'user-123',
          email: 'maintainer@defra.gov.uk',
          scope: ['serviceMaintainer']
        }
        await executor.orsImportsWorker.importOverseasSites(importId, user)

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
          command: 'import-overseas-sites',
          importId,
          user
        })
      }
    )
  })

  describe('queue connection', () => {
    it(
      'resolves queue URL and logs it',
      { timeout: TEST_TIMEOUT },
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
      { timeout: TEST_TIMEOUT },
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

  describe('trace context propagation', () => {
    it(
      'includes context.traceId in message when trace ID is available',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        getTraceId.mockReturnValue('trace-abc-123')

        const executor = await createSqsCommandExecutor({
          sqsClient,
          queueName: sqsClient.queueName,
          logger
        })

        const summaryLogId = `trace-test-${Date.now()}`
        await executor.summaryLogsWorker.validate(summaryLogId)

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
          summaryLogId,
          context: { traceId: 'trace-abc-123' }
        })

        getTraceId.mockReturnValue(null)
      }
    )

    it(
      'omits context when no trace ID is available',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        getTraceId.mockReturnValue(null)

        const executor = await createSqsCommandExecutor({
          sqsClient,
          queueName: sqsClient.queueName,
          logger
        })

        const summaryLogId = `no-trace-test-${Date.now()}`
        await executor.summaryLogsWorker.validate(summaryLogId)

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
        expect(message).not.toHaveProperty('context')
      }
    )
  })
})
