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
import { PermanentError } from '#server/queue-consumer/permanent-error.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'

vi.mock('#application/summary-logs/validate.js')
vi.mock('#application/summary-logs/submit.js')

const TEST_TIMEOUT = 60000

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
  let logger
  let summaryLogsRepository
  let organisationsRepository
  let wasteRecordsRepository
  let wasteBalancesRepository
  let summaryLogExtractor

  beforeEach(() => {
    vi.resetAllMocks()

    logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    }

    summaryLogsRepository = {
      findById: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(undefined)
    }

    organisationsRepository = {}
    wasteRecordsRepository = {}
    wasteBalancesRepository = {}

    // Mock extractor - not used in these tests but required by consumer
    summaryLogExtractor = {}

    // Set up mocks for command handlers
    const mockValidator = vi.fn().mockResolvedValue(undefined)
    vi.mocked(createSummaryLogsValidator).mockReturnValue(mockValidator)
    vi.mocked(submitSummaryLog).mockResolvedValue(undefined)
  })

  describe('queue connection', () => {
    it(
      'connects to queue and resolves URL by name',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const consumer = await createCommandQueueConsumer({
          sqsClient,
          queueName: sqsClient.queueName,
          logger,
          summaryLogsRepository,
          organisationsRepository,
          wasteRecordsRepository,
          wasteBalancesRepository,
          summaryLogExtractor
        })

        expect(consumer).toBeDefined()
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
          createCommandQueueConsumer({
            sqsClient,
            queueName: 'nonexistent-queue',
            logger,
            summaryLogsRepository,
            organisationsRepository,
            wasteRecordsRepository,
            wasteBalancesRepository,
            summaryLogExtractor
          })
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

        const consumer = await createCommandQueueConsumer({
          sqsClient,
          queueName: sqsClient.queueName,
          logger,
          summaryLogsRepository,
          organisationsRepository,
          wasteRecordsRepository,
          wasteBalancesRepository,
          summaryLogExtractor
        })

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

        const consumer = await createCommandQueueConsumer({
          sqsClient,
          queueName: sqsClient.queueName,
          logger,
          summaryLogsRepository,
          organisationsRepository,
          wasteRecordsRepository,
          wasteBalancesRepository,
          summaryLogExtractor
        })

        consumer.start()

        // Wait for submitSummaryLog to be called with correct args
        await vi.waitFor(
          () => {
            expect(submitSummaryLog).toHaveBeenCalledWith(
              summaryLogId,
              expect.objectContaining({
                logger,
                summaryLogsRepository,
                organisationsRepository,
                wasteRecordsRepository,
                wasteBalancesRepository,
                summaryLogExtractor,
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
      'deletes message from queue after successful processing',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const mockValidator = vi.fn().mockResolvedValue(undefined)
        vi.mocked(createSummaryLogsValidator).mockReturnValue(mockValidator)

        const { QueueUrl: queueUrl } = await sqsClient.send(
          new GetQueueUrlCommand({ QueueName: sqsClient.queueName })
        )
        const { QueueUrl: dlqUrl } = await sqsClient.send(
          new GetQueueUrlCommand({ QueueName: sqsClient.dlqName })
        )

        const summaryLogId = `delete-on-success-${Date.now()}`
        await sqsClient.send(
          new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify({
              command: 'validate',
              summaryLogId
            })
          })
        )

        const consumer = await createCommandQueueConsumer({
          sqsClient,
          queueName: sqsClient.queueName,
          logger,
          summaryLogsRepository,
          organisationsRepository,
          wasteRecordsRepository,
          wasteBalancesRepository,
          summaryLogExtractor
        })

        consumer.start()

        // Wait for the command to be processed successfully
        await vi.waitFor(
          () => {
            expect(mockValidator).toHaveBeenCalledWith(summaryLogId)
          },
          { timeout: 10000 }
        )

        await stopConsumerAndWait(consumer)

        // Wait for visibility timeout to expire so any undeleted message
        // reappears (VisibilityTimeout is 1s in test fixture)
        await new Promise((resolve) => setTimeout(resolve, 2000))

        // Message should be properly deleted — not still on the main queue
        const mainResponse = await sqsClient.send(
          new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            WaitTimeSeconds: 2
          })
        )
        expect(mainResponse.Messages ?? []).toHaveLength(0)

        // Message should NOT have been redelivered to the DLQ either —
        // a successfully processed message must be deleted, not retried
        // until it exhausts maxReceiveCount
        const dlqResponse = await sqsClient.send(
          new ReceiveMessageCommand({
            QueueUrl: dlqUrl,
            WaitTimeSeconds: 2
          })
        )
        expect(dlqResponse.Messages ?? []).toHaveLength(0)
      }
    )

    it(
      'sends invalid message to DLQ after retries exhausted',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const { QueueUrl: queueUrl } = await sqsClient.send(
          new GetQueueUrlCommand({ QueueName: sqsClient.queueName })
        )
        const { QueueUrl: dlqUrl } = await sqsClient.send(
          new GetQueueUrlCommand({ QueueName: sqsClient.dlqName })
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

        const consumer = await createCommandQueueConsumer({
          sqsClient,
          queueName: sqsClient.queueName,
          logger,
          summaryLogsRepository,
          organisationsRepository,
          wasteRecordsRepository,
          wasteBalancesRepository,
          summaryLogExtractor
        })

        consumer.start()

        await vi.waitFor(
          () => {
            expect(logger.error).toHaveBeenCalledWith(
              expect.objectContaining({
                message: expect.stringContaining('Invalid command message')
              })
            )
          },
          { timeout: 10000 }
        )

        // Wait for message to land on DLQ after retries exhausted
        await vi.waitFor(
          async () => {
            const dlqResponse = await sqsClient.send(
              new ReceiveMessageCommand({
                QueueUrl: dlqUrl,
                WaitTimeSeconds: 0
              })
            )
            expect(dlqResponse.Messages).toHaveLength(1)

            const dlqBody = JSON.parse(dlqResponse.Messages[0].Body)
            expect(dlqBody.command).toBe('validate')
            expect(dlqBody.badField).toBe('test')
          },
          { timeout: 15000, interval: 500 }
        )

        await stopConsumerAndWait(consumer)
      }
    )

    it(
      'sends unknown command type to DLQ via Joi validation rejection',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const { QueueUrl: queueUrl } = await sqsClient.send(
          new GetQueueUrlCommand({ QueueName: sqsClient.queueName })
        )
        const { QueueUrl: dlqUrl } = await sqsClient.send(
          new GetQueueUrlCommand({ QueueName: sqsClient.dlqName })
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

        const consumer = await createCommandQueueConsumer({
          sqsClient,
          queueName: sqsClient.queueName,
          logger,
          summaryLogsRepository,
          organisationsRepository,
          wasteRecordsRepository,
          wasteBalancesRepository,
          summaryLogExtractor
        })

        consumer.start()

        await vi.waitFor(
          () => {
            expect(logger.error).toHaveBeenCalledWith(
              expect.objectContaining({
                message: expect.stringContaining(
                  'must be one of [validate, submit]'
                )
              })
            )
          },
          { timeout: 10000 }
        )

        // Wait for message to land on DLQ after retries exhausted
        await vi.waitFor(
          async () => {
            const dlqResponse = await sqsClient.send(
              new ReceiveMessageCommand({
                QueueUrl: dlqUrl,
                WaitTimeSeconds: 0
              })
            )
            expect(dlqResponse.Messages).toHaveLength(1)

            const dlqBody = JSON.parse(dlqResponse.Messages[0].Body)
            expect(dlqBody.summaryLogId).toBe(uniqueId)
          },
          { timeout: 15000, interval: 500 }
        )

        await stopConsumerAndWait(consumer)
      }
    )
  })

  describe('transient vs permanent errors', () => {
    it(
      'deletes message and does not retry on PermanentError',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const mockValidator = vi
          .fn()
          .mockRejectedValue(new PermanentError('Summary log not found'))
        vi.mocked(createSummaryLogsValidator).mockReturnValue(mockValidator)

        const { QueueUrl: queueUrl } = await sqsClient.send(
          new GetQueueUrlCommand({ QueueName: sqsClient.queueName })
        )
        const { QueueUrl: dlqUrl } = await sqsClient.send(
          new GetQueueUrlCommand({ QueueName: sqsClient.dlqName })
        )

        const summaryLogId = `permanent-test-${Date.now()}`
        await sqsClient.send(
          new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify({
              command: 'validate',
              summaryLogId
            })
          })
        )

        const consumer = await createCommandQueueConsumer({
          sqsClient,
          queueName: sqsClient.queueName,
          logger,
          summaryLogsRepository,
          organisationsRepository,
          wasteRecordsRepository,
          wasteBalancesRepository,
          summaryLogExtractor
        })

        consumer.start()

        // Wait for the permanent error to be logged
        await vi.waitFor(
          () => {
            expect(logger.error).toHaveBeenCalledWith(
              expect.objectContaining({
                message: expect.stringContaining('(permanent)')
              })
            )
          },
          { timeout: 10000 }
        )

        await stopConsumerAndWait(consumer)

        // Message should be deleted from main queue (handler returned normally)
        const mainResponse = await sqsClient.send(
          new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            WaitTimeSeconds: 2
          })
        )
        expect(mainResponse.Messages ?? []).toHaveLength(0)

        // Message should NOT be on DLQ (it was handled, not failed)
        const dlqResponse = await sqsClient.send(
          new ReceiveMessageCommand({
            QueueUrl: dlqUrl,
            WaitTimeSeconds: 2
          })
        )
        expect(dlqResponse.Messages ?? []).toHaveLength(0)
      }
    )

    it(
      'retries transient errors, marks as failed on final attempt, and sends to DLQ',
      { timeout: TEST_TIMEOUT },
      async ({ sqsClient }) => {
        const mockValidator = vi
          .fn()
          .mockRejectedValue(new Error('Database timeout'))
        vi.mocked(createSummaryLogsValidator).mockReturnValue(mockValidator)

        summaryLogsRepository.findById.mockResolvedValue({
          version: 1,
          summaryLog: { status: SUMMARY_LOG_STATUS.VALIDATING }
        })

        const { QueueUrl: queueUrl } = await sqsClient.send(
          new GetQueueUrlCommand({ QueueName: sqsClient.queueName })
        )
        const { QueueUrl: dlqUrl } = await sqsClient.send(
          new GetQueueUrlCommand({ QueueName: sqsClient.dlqName })
        )

        const summaryLogId = `transient-test-${Date.now()}`
        await sqsClient.send(
          new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify({
              command: 'validate',
              summaryLogId
            })
          })
        )

        const consumer = await createCommandQueueConsumer({
          sqsClient,
          queueName: sqsClient.queueName,
          logger,
          summaryLogsRepository,
          organisationsRepository,
          wasteRecordsRepository,
          wasteBalancesRepository,
          summaryLogExtractor
        })

        consumer.start()

        // Wait for the message to land on the DLQ after retries exhausted
        // (maxReceiveCount=2, VisibilityTimeout=1s)
        await vi.waitFor(
          () => {
            expect(mockValidator.mock.calls.length).toBeGreaterThanOrEqual(2)
          },
          { timeout: 15000 }
        )

        // Summary log should be marked as failed on the final attempt
        expect(summaryLogsRepository.update).toHaveBeenCalledWith(
          summaryLogId,
          1,
          expect.objectContaining({
            status: SUMMARY_LOG_STATUS.VALIDATION_FAILED
          })
        )

        // Wait for message to land on DLQ. The consumer must stay alive so
        // SQS can attempt another receive where it sees receiveCount >
        // maxReceiveCount and redirects the message to the DLQ.
        await vi.waitFor(
          async () => {
            const dlqResponse = await sqsClient.send(
              new ReceiveMessageCommand({
                QueueUrl: dlqUrl,
                WaitTimeSeconds: 0
              })
            )
            expect(dlqResponse.Messages).toHaveLength(1)

            const dlqBody = JSON.parse(dlqResponse.Messages[0].Body)
            expect(dlqBody.summaryLogId).toBe(summaryLogId)
          },
          { timeout: 15000, interval: 500 }
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
        const consumer = await createCommandQueueConsumer({
          sqsClient,
          queueName: sqsClient.queueName,
          logger,
          summaryLogsRepository,
          organisationsRepository,
          wasteRecordsRepository,
          wasteBalancesRepository,
          summaryLogExtractor
        })

        consumer.start()
        expect(consumer.status.isRunning).toBe(true)

        await stopConsumerAndWait(consumer)
        expect(consumer.status.isRunning).toBe(false)
      }
    )
  })
})
