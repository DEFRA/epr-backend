import { describe, expect, vi, beforeEach } from 'vitest'
import {
  SendMessageCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand
} from '@aws-sdk/client-sqs'
import { it } from '#vite/fixtures/sqs.js'
import { createCommandQueueConsumer } from './consumer.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { submitSummaryLog } from '#application/summary-logs/submit.js'

vi.mock('#application/summary-logs/validate.js')
vi.mock('#application/summary-logs/submit.js')

const TEST_TIMEOUT = 30000

/**
 * Stops the consumer and waits for it to fully stop.
 * @param {import('sqs-consumer').Consumer} consumer
 * @returns {Promise<void>}
 */
const stopConsumerAndWait = (consumer) => {
  return new Promise((resolve) => {
    if (!consumer.status.isRunning) {
      resolve()
      return
    }
    consumer.on('stopped', resolve)
    consumer.stop()
  })
}

/**
 * Integration tests for SQS command queue consumer.
 *
 * These tests verify the consumer's interaction with a real SQS queue
 * (via LocalStack). They focus on:
 * - Queue connection and URL resolution
 * - Message receipt and deletion
 * - Error handling at the SQS level
 *
 * The consumer's internal message handling (validation, submission) is
 * tested in the unit tests. Here we inject mock dependencies to isolate
 * the SQS behaviour.
 */
describe('SQS command queue consumer integration', () => {
  let baseLogger
  let messageLogger
  let summaryLogsRepository
  let organisationsRepository
  let wasteRecordsRepository
  let wasteBalancesRepository
  let uploadsRepository

  beforeEach(() => {
    vi.resetAllMocks()

    // Message-scoped logger created via logger.child()
    messageLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    }

    // Base logger that creates child loggers per message
    baseLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      child: vi.fn().mockReturnValue(messageLogger)
    }

    summaryLogsRepository = {
      findById: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(undefined)
    }

    organisationsRepository = {}
    wasteRecordsRepository = {}
    wasteBalancesRepository = {}
    uploadsRepository = {}

    // Set up mocks for command handlers
    const mockValidator = vi.fn().mockResolvedValue(undefined)
    vi.mocked(createSummaryLogsValidator).mockReturnValue(mockValidator)
    vi.mocked(submitSummaryLog).mockResolvedValue(undefined)
  })

  // Helper to create consumer with factory-based API
  const createConsumerWithMocks = (
    sqsClient,
    queueName = sqsClient.queueName
  ) =>
    createCommandQueueConsumer({
      sqsClient,
      queueName,
      logger: baseLogger,
      uploadsRepository,
      summaryLogsRepositoryFactory: () => summaryLogsRepository,
      organisationsRepositoryFactory: () => organisationsRepository,
      wasteRecordsRepositoryFactory: () => wasteRecordsRepository,
      wasteBalancesRepositoryFactory: () => wasteBalancesRepository
    })

  describe('queue connection', () => {
    it(
      'connects to queue and resolves URL by name',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const consumer = await createConsumerWithMocks(sqsClient)

        expect(consumer).toBeDefined()
        expect(baseLogger.info).toHaveBeenCalledWith(
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
          createConsumerWithMocks(sqsClient, 'nonexistent-queue')
        ).rejects.toThrow()
      }
    )
  })

  describe('message lifecycle', () => {
    it(
      'calls validateSummaryLog when validate command received',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const mockValidator = vi.fn().mockResolvedValue(undefined)
        vi.mocked(createSummaryLogsValidator).mockReturnValue(mockValidator)

        const { QueueUrl: queueUrl } = await sqsClient.send(
          new GetQueueUrlCommand({ QueueName: sqsClient.queueName })
        )

        // Send a validate command
        const summaryLogId = `validate-test-${Date.now()}`
        await sqsClient.send(
          new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify({
              command: 'validate',
              summaryLogId
            })
          })
        )

        const consumer = await createConsumerWithMocks(sqsClient)

        consumer.start()

        // Wait for validator to be called with correct summaryLogId
        await vi.waitFor(
          () => {
            expect(mockValidator).toHaveBeenCalledWith(summaryLogId)
          },
          { timeout: 10000 }
        )

        await stopConsumerAndWait(consumer)
      }
    )

    it(
      'calls submitSummaryLog when submit command received',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const { QueueUrl: queueUrl } = await sqsClient.send(
          new GetQueueUrlCommand({ QueueName: sqsClient.queueName })
        )

        // Send a submit command with user context
        const summaryLogId = `submit-test-${Date.now()}`
        const user = {
          id: 'user-123',
          email: 'test@example.com',
          scope: ['operator']
        }
        await sqsClient.send(
          new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify({
              command: 'submit',
              summaryLogId,
              user
            })
          })
        )

        const consumer = await createConsumerWithMocks(sqsClient)

        consumer.start()

        // Wait for submitSummaryLog to be called with correct args
        // Note: message-scoped logger and repos are passed, not the base ones
        await vi.waitFor(
          () => {
            expect(submitSummaryLog).toHaveBeenCalledWith(
              summaryLogId,
              expect.objectContaining({
                logger: messageLogger,
                summaryLogsRepository,
                organisationsRepository,
                wasteRecordsRepository,
                wasteBalancesRepository,
                user
              })
            )
          },
          { timeout: 10000 }
        )

        await stopConsumerAndWait(consumer)
      }
    )

    it(
      'deletes invalid message after logging error',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const { QueueUrl: queueUrl } = await sqsClient.send(
          new GetQueueUrlCommand({ QueueName: sqsClient.queueName })
        )

        // Send invalid message (missing summaryLogId)
        await sqsClient.send(
          new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify({
              command: 'validate',
              badField: 'test'
            })
          })
        )

        const consumer = await createConsumerWithMocks(sqsClient)

        consumer.start()

        // Parsing errors use base logger (before message deps are created)
        await vi.waitFor(
          () => {
            expect(baseLogger.error).toHaveBeenCalledWith(
              expect.objectContaining({
                message: expect.stringContaining('Invalid command message')
              })
            )
          },
          { timeout: 10000 }
        )

        await stopConsumerAndWait(consumer)

        // Message should be deleted (invalid messages are not retried)
        const response = await sqsClient.send(
          new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            WaitTimeSeconds: 2
          })
        )

        expect(response.Messages ?? []).toHaveLength(0)
      }
    )

    it(
      'rejects unknown command type via Joi validation',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const { QueueUrl: queueUrl } = await sqsClient.send(
          new GetQueueUrlCommand({ QueueName: sqsClient.queueName })
        )

        // Send message with unknown command
        const uniqueId = `unknown-${Date.now()}`
        await sqsClient.send(
          new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify({
              command: 'unknown',
              summaryLogId: uniqueId
            })
          })
        )

        const consumer = await createConsumerWithMocks(sqsClient)

        consumer.start()

        // Parsing errors use base logger (before message deps are created)
        await vi.waitFor(
          () => {
            expect(baseLogger.error).toHaveBeenCalledWith(
              expect.objectContaining({
                message: expect.stringContaining(
                  'must be one of [validate, submit]'
                )
              })
            )
          },
          { timeout: 10000 }
        )

        await stopConsumerAndWait(consumer)
      }
    )
  })

  describe('graceful shutdown', () => {
    it(
      'stops polling when stop is called',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const consumer = await createConsumerWithMocks(sqsClient)

        consumer.start()
        expect(consumer.status.isRunning).toBe(true)

        await stopConsumerAndWait(consumer)
        expect(consumer.status.isRunning).toBe(false)
      }
    )
  })
})
