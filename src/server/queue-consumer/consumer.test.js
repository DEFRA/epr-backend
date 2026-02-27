import { Consumer } from 'sqs-consumer'
import {
  GetQueueUrlCommand,
  GetQueueAttributesCommand
} from '@aws-sdk/client-sqs'

import { createCommandQueueConsumer } from './consumer.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { PermanentError } from '#server/queue-consumer/permanent-error.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'

vi.mock('sqs-consumer')
vi.mock('@aws-sdk/client-sqs', () => ({
  GetQueueUrlCommand: vi.fn(),
  GetQueueAttributesCommand: vi.fn()
}))
vi.mock('#application/summary-logs/validate.js')
vi.mock('#application/waste-records/sync-from-summary-log.js')
vi.mock('#common/helpers/metrics/summary-logs.js')

const { createSummaryLogsValidator } =
  await import('#application/summary-logs/validate.js')
const { syncFromSummaryLog } =
  await import('#application/waste-records/sync-from-summary-log.js')
const { summaryLogMetrics } =
  await import('#common/helpers/metrics/summary-logs.js')

describe('createCommandQueueConsumer', () => {
  let sqsClient
  let logger
  let summaryLogsRepository
  let organisationsRepository
  let wasteRecordsRepository
  let wasteBalancesRepository
  let summaryLogExtractor
  let mockConsumer
  let eventHandlers

  beforeEach(() => {
    eventHandlers = {}

    sqsClient = {
      send: vi.fn().mockImplementation((command) => {
        if (command instanceof GetQueueAttributesCommand) {
          return Promise.resolve({
            Attributes: {
              RedrivePolicy: JSON.stringify({ maxReceiveCount: '2' })
            }
          })
        }
        return Promise.resolve({
          QueueUrl: 'http://localhost:4566/000000000000/test-queue'
        })
      })
    }

    logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    }

    summaryLogsRepository = {
      findById: vi.fn(),
      update: vi.fn()
    }

    organisationsRepository = {}
    wasteRecordsRepository = {}
    wasteBalancesRepository = {}
    summaryLogExtractor = {}

    mockConsumer = {
      on: vi.fn((event, handler) => {
        eventHandlers[event] = handler
      }),
      start: vi.fn(),
      stop: vi.fn()
    }

    vi.mocked(Consumer.create).mockReturnValue(mockConsumer)
    vi.mocked(GetQueueUrlCommand).mockImplementation(function (params) {
      this.QueueName = params.QueueName
    })
    vi.mocked(GetQueueAttributesCommand).mockImplementation(function () {})
    vi.mocked(createSummaryLogsValidator).mockReturnValue(vi.fn())
    vi.mocked(syncFromSummaryLog).mockReturnValue(
      vi.fn().mockResolvedValue({ created: 0, updated: 0 })
    )
    vi.mocked(summaryLogMetrics).timedSubmission = vi.fn((_, fn) => fn())
    vi.mocked(summaryLogMetrics).recordWasteRecordsCreated = vi.fn()
    vi.mocked(summaryLogMetrics).recordWasteRecordsUpdated = vi.fn()
    vi.mocked(summaryLogMetrics).recordStatusTransition = vi.fn()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  const createConsumer = () =>
    createCommandQueueConsumer({
      sqsClient,
      queueName: 'test-queue',
      logger,
      summaryLogsRepository,
      organisationsRepository,
      wasteRecordsRepository,
      wasteBalancesRepository,
      summaryLogExtractor
    })

  describe('queue URL resolution', () => {
    it('looks up queue URL by name', async () => {
      await createConsumer()

      expect(sqsClient.send).toHaveBeenCalledWith({ QueueName: 'test-queue' })
    })

    it('logs resolved queue URL', async () => {
      await createConsumer()

      expect(logger.info).toHaveBeenCalledWith({
        message:
          'Resolved queue URL: http://localhost:4566/000000000000/test-queue for queueName=test-queue'
      })
    })

    it('throws if queue not found', async () => {
      sqsClient.send.mockResolvedValue({ QueueUrl: undefined })

      await expect(createConsumer()).rejects.toThrow(
        'Queue not found: test-queue'
      )
    })

    it('logs redrive policy maxReceiveCount', async () => {
      await createConsumer()

      expect(logger.info).toHaveBeenCalledWith({
        message:
          'Queue redrive policy: maxReceiveCount=2 for queueName=test-queue'
      })
    })

    it('warns when no redrive policy is configured', async () => {
      sqsClient.send.mockImplementation((command) => {
        if (command instanceof GetQueueAttributesCommand) {
          return Promise.resolve({ Attributes: {} })
        }
        return Promise.resolve({
          QueueUrl: 'http://localhost:4566/000000000000/test-queue'
        })
      })

      await createConsumer()

      expect(logger.warn).toHaveBeenCalledWith({
        message:
          'No redrive policy configured for queueName=test-queue; transient errors on final retry will not be marked as failed'
      })
    })
  })

  describe('consumer creation', () => {
    it('creates consumer with resolved queue URL and SQS client', async () => {
      await createConsumer()

      expect(Consumer.create).toHaveBeenCalledWith({
        queueUrl: 'http://localhost:4566/000000000000/test-queue',
        sqs: sqsClient,
        handleMessage: expect.any(Function),
        handleMessageTimeout: 300000,
        attributeNames: ['ApproximateReceiveCount']
      })
    })

    it('returns the consumer instance', async () => {
      const result = await createConsumer()

      expect(result).toBe(mockConsumer)
    })

    it('attaches error handler', async () => {
      await createConsumer()

      expect(mockConsumer.on).toHaveBeenCalledWith(
        'error',
        expect.any(Function)
      )
    })

    it('attaches processing_error handler', async () => {
      await createConsumer()

      expect(mockConsumer.on).toHaveBeenCalledWith(
        'processing_error',
        expect.any(Function)
      )
    })

    it('attaches timeout_error handler', async () => {
      await createConsumer()

      expect(mockConsumer.on).toHaveBeenCalledWith(
        'timeout_error',
        expect.any(Function)
      )
    })
  })

  describe('error event handlers', () => {
    it('logs error on error event', async () => {
      await createConsumer()
      const error = new Error('Connection failed')

      eventHandlers.error(error)

      expect(logger.error).toHaveBeenCalledWith({
        err: error,
        message: 'SQS consumer error',
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.CONNECTION_FAILURE
        }
      })
    })

    it('logs error on processing_error event', async () => {
      await createConsumer()
      const error = new Error('Processing failed')

      eventHandlers.processing_error(error)

      expect(logger.error).toHaveBeenCalledWith({
        err: error,
        message: 'SQS message processing error',
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
        }
      })
    })

    it('logs timeout error with command info and marks as failed', async () => {
      await createConsumer()
      const error = new Error('Timeout')
      const message = {
        MessageId: 'msg-123',
        Body: JSON.stringify({
          command: 'validate',
          summaryLogId: 'summary-123'
        })
      }

      await eventHandlers.timeout_error(error, message)

      expect(logger.error).toHaveBeenCalledWith({
        err: error,
        message:
          'Command timed out: validate for summaryLogId=summary-123 messageId=msg-123',
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
        }
      })
    })

    it('marks summary log as validation_failed on validate timeout', async () => {
      summaryLogsRepository.findById.mockResolvedValue({
        version: 1,
        summaryLog: { status: SUMMARY_LOG_STATUS.VALIDATING }
      })

      await createConsumer()
      const error = new Error('Timeout')
      const message = {
        MessageId: 'msg-123',
        Body: JSON.stringify({
          command: 'validate',
          summaryLogId: 'summary-123'
        })
      }

      await eventHandlers.timeout_error(error, message)

      expect(summaryLogsRepository.update).toHaveBeenCalledWith(
        'summary-123',
        1,
        expect.objectContaining({
          status: SUMMARY_LOG_STATUS.VALIDATION_FAILED
        })
      )
    })

    it('marks summary log as submission_failed on submit timeout', async () => {
      summaryLogsRepository.findById.mockResolvedValue({
        version: 1,
        summaryLog: { status: SUMMARY_LOG_STATUS.SUBMITTING }
      })

      await createConsumer()
      const error = new Error('Timeout')
      const message = {
        MessageId: 'msg-123',
        Body: JSON.stringify({
          command: 'submit',
          summaryLogId: 'summary-123'
        })
      }

      await eventHandlers.timeout_error(error, message)

      expect(summaryLogsRepository.update).toHaveBeenCalledWith(
        'summary-123',
        1,
        expect.objectContaining({
          status: SUMMARY_LOG_STATUS.SUBMISSION_FAILED
        })
      )
    })

    it('logs timeout with messageId when message body is invalid', async () => {
      await createConsumer()
      const error = new Error('Timeout')
      const message = {
        MessageId: 'msg-456',
        Body: 'not json'
      }

      await eventHandlers.timeout_error(error, message)

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Command timed out for messageId=msg-456'
        })
      )
    })
  })

  describe('message handling', () => {
    let handleMessage

    beforeEach(async () => {
      await createConsumer()
      handleMessage = Consumer.create.mock.calls[0][0].handleMessage
    })

    describe('message parsing', () => {
      it('throws for invalid JSON so SQS retries and sends to DLQ', async () => {
        const message = {
          MessageId: 'msg-123',
          Body: 'not valid json'
        }

        await expect(handleMessage(message)).rejects.toThrow(
          'Unparseable command message, messageId=msg-123'
        )

        expect(logger.error).toHaveBeenCalledWith({
          message: 'Failed to parse SQS message body for messageId=msg-123',
          event: {
            category: LOGGING_EVENT_CATEGORIES.SERVER,
            action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
          }
        })
      })

      it('uses unknown as fallback when MessageId is missing', async () => {
        const message = { Body: 'not valid json' }

        await expect(handleMessage(message)).rejects.toThrow(
          'Unparseable command message, messageId=undefined'
        )

        expect(logger.error).toHaveBeenCalledWith({
          message: 'Failed to parse SQS message body for messageId=unknown',
          event: {
            category: LOGGING_EVENT_CATEGORIES.SERVER,
            action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
          }
        })
      })

      it('throws for missing body so SQS retries and sends to DLQ', async () => {
        const message = { MessageId: 'msg-123' }

        await expect(handleMessage(message)).rejects.toThrow(
          'Unparseable command message, messageId=msg-123'
        )

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            message:
              'Invalid command message for messageId=msg-123: "command" is required'
          })
        )
      })

      it('throws for missing command field so SQS retries and sends to DLQ', async () => {
        const message = {
          MessageId: 'msg-123',
          Body: JSON.stringify({ summaryLogId: 'log-123' })
        }

        await expect(handleMessage(message)).rejects.toThrow(
          'Unparseable command message, messageId=msg-123'
        )

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            message:
              'Invalid command message for messageId=msg-123: "command" is required'
          })
        )
      })

      it('throws for missing summaryLogId field so SQS retries and sends to DLQ', async () => {
        const message = {
          MessageId: 'msg-123',
          Body: JSON.stringify({ command: 'validate' })
        }

        await expect(handleMessage(message)).rejects.toThrow(
          'Unparseable command message, messageId=msg-123'
        )

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            message:
              'Invalid command message for messageId=msg-123: "summaryLogId" is required'
          })
        )
      })

      it('throws for invalid command type so SQS retries and sends to DLQ', async () => {
        const message = {
          MessageId: 'msg-123',
          Body: JSON.stringify({ command: 'unknown', summaryLogId: 'log-123' })
        }

        await expect(handleMessage(message)).rejects.toThrow(
          'Unparseable command message, messageId=msg-123'
        )

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            message:
              'Invalid command message for messageId=msg-123: "command" must be one of [validate, submit]'
          })
        )
      })
    })

    describe('validate command', () => {
      it('processes validate command successfully', async () => {
        const mockValidator = vi.fn()
        vi.mocked(createSummaryLogsValidator).mockReturnValue(mockValidator)

        const message = {
          MessageId: 'msg-123',
          Body: JSON.stringify({ command: 'validate', summaryLogId: 'log-123' })
        }

        await handleMessage(message)

        expect(mockValidator).toHaveBeenCalledWith('log-123')
        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            message:
              'Command completed: validate for summaryLogId=log-123 messageId=msg-123'
          })
        )
      })

      describe('permanent errors', () => {
        it('marks as validation_failed when validate command fails with PermanentError', async () => {
          const mockValidator = vi
            .fn()
            .mockRejectedValue(
              new PermanentError('Summary log not found: summaryLogId=log-123')
            )
          vi.mocked(createSummaryLogsValidator).mockReturnValue(mockValidator)

          summaryLogsRepository.findById.mockResolvedValue({
            version: 1,
            summaryLog: { status: SUMMARY_LOG_STATUS.VALIDATING }
          })

          const message = {
            MessageId: 'msg-123',
            Body: JSON.stringify({
              command: 'validate',
              summaryLogId: 'log-123'
            })
          }

          await handleMessage(message)

          expect(summaryLogsRepository.update).toHaveBeenCalledWith(
            'log-123',
            1,
            expect.objectContaining({
              status: SUMMARY_LOG_STATUS.VALIDATION_FAILED
            })
          )
        })

        it('logs warning when summary log not found during failure handling', async () => {
          const mockValidator = vi
            .fn()
            .mockRejectedValue(
              new PermanentError('Summary log not found: summaryLogId=log-123')
            )
          vi.mocked(createSummaryLogsValidator).mockReturnValue(mockValidator)

          summaryLogsRepository.findById.mockResolvedValue(null)

          const message = {
            MessageId: 'msg-123',
            Body: JSON.stringify({
              command: 'validate',
              summaryLogId: 'log-123'
            })
          }

          await handleMessage(message)

          expect(logger.warn).toHaveBeenCalledWith({
            message:
              'Cannot mark as validation_failed: summary log not found, summaryLogId=log-123'
          })
        })

        it('skips marking as failed if not in processing status', async () => {
          const mockValidator = vi
            .fn()
            .mockRejectedValue(
              new PermanentError('Summary log not found: summaryLogId=log-123')
            )
          vi.mocked(createSummaryLogsValidator).mockReturnValue(mockValidator)

          summaryLogsRepository.findById.mockResolvedValue({
            version: 1,
            summaryLog: { status: SUMMARY_LOG_STATUS.VALIDATED }
          })

          const message = {
            MessageId: 'msg-123',
            Body: JSON.stringify({
              command: 'validate',
              summaryLogId: 'log-123'
            })
          }

          await handleMessage(message)

          expect(summaryLogsRepository.update).not.toHaveBeenCalled()
        })

        it('logs error when marking as failed fails', async () => {
          const mockValidator = vi
            .fn()
            .mockRejectedValue(
              new PermanentError('Summary log not found: summaryLogId=log-123')
            )
          vi.mocked(createSummaryLogsValidator).mockReturnValue(mockValidator)

          summaryLogsRepository.findById.mockResolvedValue({
            version: 1,
            summaryLog: { status: SUMMARY_LOG_STATUS.VALIDATING }
          })
          const updateError = new Error('Database error')
          summaryLogsRepository.update.mockRejectedValue(updateError)

          const message = {
            MessageId: 'msg-123',
            Body: JSON.stringify({
              command: 'validate',
              summaryLogId: 'log-123'
            })
          }

          await handleMessage(message)

          expect(logger.error).toHaveBeenCalledWith({
            err: updateError,
            message:
              'Failed to mark summary log as validation_failed, summaryLogId=log-123'
          })
        })
      })

      describe('transient errors', () => {
        it('rethrows transient errors for SQS retry', async () => {
          const transientError = new Error('Database timeout')
          const mockValidator = vi.fn().mockRejectedValue(transientError)
          vi.mocked(createSummaryLogsValidator).mockReturnValue(mockValidator)

          const message = {
            MessageId: 'msg-123',
            Attributes: { ApproximateReceiveCount: '1' },
            Body: JSON.stringify({
              command: 'validate',
              summaryLogId: 'log-123'
            })
          }

          await expect(handleMessage(message)).rejects.toThrow(
            'Database timeout'
          )
        })

        it('does not mark as failed for transient errors on non-final attempt', async () => {
          const mockValidator = vi
            .fn()
            .mockRejectedValue(new Error('Database timeout'))
          vi.mocked(createSummaryLogsValidator).mockReturnValue(mockValidator)

          const message = {
            MessageId: 'msg-123',
            Attributes: { ApproximateReceiveCount: '1' },
            Body: JSON.stringify({
              command: 'validate',
              summaryLogId: 'log-123'
            })
          }

          await handleMessage(message).catch(() => {})

          expect(summaryLogsRepository.update).not.toHaveBeenCalled()
        })

        it('does not mark as failed when Attributes are missing', async () => {
          const mockValidator = vi
            .fn()
            .mockRejectedValue(new Error('Database timeout'))
          vi.mocked(createSummaryLogsValidator).mockReturnValue(mockValidator)

          const message = {
            MessageId: 'msg-123',
            Body: JSON.stringify({
              command: 'validate',
              summaryLogId: 'log-123'
            })
          }

          await handleMessage(message).catch(() => {})

          expect(summaryLogsRepository.update).not.toHaveBeenCalled()
        })

        it('marks as failed on final attempt before rethrowing', async () => {
          const mockValidator = vi
            .fn()
            .mockRejectedValue(new Error('Database timeout'))
          vi.mocked(createSummaryLogsValidator).mockReturnValue(mockValidator)

          summaryLogsRepository.findById.mockResolvedValue({
            version: 1,
            summaryLog: { status: SUMMARY_LOG_STATUS.VALIDATING }
          })

          const message = {
            MessageId: 'msg-123',
            Attributes: { ApproximateReceiveCount: '2' },
            Body: JSON.stringify({
              command: 'validate',
              summaryLogId: 'log-123'
            })
          }

          await expect(handleMessage(message)).rejects.toThrow(
            'Database timeout'
          )

          expect(summaryLogsRepository.update).toHaveBeenCalledWith(
            'log-123',
            1,
            expect.objectContaining({
              status: SUMMARY_LOG_STATUS.VALIDATION_FAILED
            })
          )
        })
      })
    })

    describe('submit command', () => {
      const testUser = {
        id: 'user-1',
        email: 'test@example.com',
        scope: ['submit']
      }

      beforeEach(() => {
        summaryLogsRepository.findById.mockResolvedValue({
          version: 1,
          summaryLog: {
            status: SUMMARY_LOG_STATUS.SUBMITTING,
            meta: {}
          }
        })
        summaryLogsRepository.update.mockResolvedValue(undefined)
      })

      it('processes submit command successfully', async () => {
        const message = {
          MessageId: 'msg-123',
          Body: JSON.stringify({
            command: 'submit',
            summaryLogId: 'log-123',
            user: testUser
          })
        }

        await handleMessage(message)

        expect(summaryLogsRepository.update).toHaveBeenCalledWith(
          'log-123',
          1,
          expect.objectContaining({
            status: SUMMARY_LOG_STATUS.SUBMITTED
          })
        )
        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Summary log submitted: summaryLogId=log-123'
          })
        )
      })

      it('records metrics during submission', async () => {
        const mockSync = vi.fn().mockResolvedValue({ created: 5, updated: 3 })
        vi.mocked(syncFromSummaryLog).mockReturnValue(mockSync)
        vi.mocked(summaryLogMetrics).timedSubmission.mockImplementation(
          (_, fn) => fn()
        )

        const message = {
          MessageId: 'msg-123',
          Body: JSON.stringify({
            command: 'submit',
            summaryLogId: 'log-123',
            user: testUser
          })
        }

        await handleMessage(message)

        expect(summaryLogMetrics.timedSubmission).toHaveBeenCalled()
        expect(summaryLogMetrics.recordWasteRecordsCreated).toHaveBeenCalled()
        expect(summaryLogMetrics.recordWasteRecordsUpdated).toHaveBeenCalled()
        expect(summaryLogMetrics.recordStatusTransition).toHaveBeenCalled()
      })

      describe('permanent errors', () => {
        it('marks as failed when submit command has no user context', async () => {
          const message = {
            MessageId: 'msg-123',
            Body: JSON.stringify({
              command: 'submit',
              summaryLogId: 'log-123'
            })
          }

          await handleMessage(message)

          expect(logger.error).toHaveBeenCalledWith(
            expect.objectContaining({
              message:
                'Command failed (permanent): submit for summaryLogId=log-123 messageId=msg-123'
            })
          )
        })

        it('marks as failed when summary log not found', async () => {
          summaryLogsRepository.findById.mockResolvedValueOnce(null)
          summaryLogsRepository.findById.mockResolvedValueOnce(null)

          const message = {
            MessageId: 'msg-123',
            Body: JSON.stringify({
              command: 'submit',
              summaryLogId: 'log-123',
              user: testUser
            })
          }

          await handleMessage(message)

          expect(logger.error).toHaveBeenCalledWith(
            expect.objectContaining({
              message:
                'Command failed (permanent): submit for summaryLogId=log-123 messageId=msg-123'
            })
          )
          expect(logger.warn).toHaveBeenCalledWith({
            message:
              'Cannot mark as submission_failed: summary log not found, summaryLogId=log-123'
          })
        })

        it('marks as failed when summary log not in submitting status', async () => {
          summaryLogsRepository.findById.mockResolvedValue({
            version: 1,
            summaryLog: { status: SUMMARY_LOG_STATUS.VALIDATED }
          })

          const message = {
            MessageId: 'msg-123',
            Body: JSON.stringify({
              command: 'submit',
              summaryLogId: 'log-123',
              user: testUser
            })
          }

          await handleMessage(message)

          expect(logger.error).toHaveBeenCalledWith(
            expect.objectContaining({
              err: expect.objectContaining({
                message: expect.stringContaining('must be in submitting status')
              })
            })
          )
        })
      })

      describe('transient errors', () => {
        it('rethrows transient errors for SQS retry', async () => {
          const syncError = new Error('Sync failed')
          vi.mocked(summaryLogMetrics).timedSubmission.mockRejectedValue(
            syncError
          )

          summaryLogsRepository.findById.mockResolvedValue({
            version: 1,
            summaryLog: { status: SUMMARY_LOG_STATUS.SUBMITTING, meta: {} }
          })

          const message = {
            MessageId: 'msg-123',
            Attributes: { ApproximateReceiveCount: '1' },
            Body: JSON.stringify({
              command: 'submit',
              summaryLogId: 'log-123',
              user: testUser
            })
          }

          await expect(handleMessage(message)).rejects.toThrow('Sync failed')
        })

        it('does not mark as failed for transient errors on non-final attempt', async () => {
          const syncError = new Error('Sync failed')
          vi.mocked(summaryLogMetrics).timedSubmission.mockRejectedValue(
            syncError
          )

          summaryLogsRepository.findById.mockResolvedValue({
            version: 1,
            summaryLog: { status: SUMMARY_LOG_STATUS.SUBMITTING, meta: {} }
          })

          const message = {
            MessageId: 'msg-123',
            Attributes: { ApproximateReceiveCount: '1' },
            Body: JSON.stringify({
              command: 'submit',
              summaryLogId: 'log-123',
              user: testUser
            })
          }

          await handleMessage(message).catch(() => {})

          // findById is called once by submitSummaryLog, but update should NOT be called
          expect(summaryLogsRepository.update).not.toHaveBeenCalled()
        })

        it('marks as failed on final attempt before rethrowing', async () => {
          const syncError = new Error('Sync failed')
          vi.mocked(summaryLogMetrics).timedSubmission.mockRejectedValue(
            syncError
          )

          summaryLogsRepository.findById.mockResolvedValue({
            version: 1,
            summaryLog: { status: SUMMARY_LOG_STATUS.SUBMITTING, meta: {} }
          })

          const message = {
            MessageId: 'msg-123',
            Attributes: { ApproximateReceiveCount: '2' },
            Body: JSON.stringify({
              command: 'submit',
              summaryLogId: 'log-123',
              user: testUser
            })
          }

          await expect(handleMessage(message)).rejects.toThrow('Sync failed')

          expect(summaryLogsRepository.update).toHaveBeenCalledWith(
            'log-123',
            1,
            expect.objectContaining({
              status: SUMMARY_LOG_STATUS.SUBMISSION_FAILED
            })
          )
        })
      })
    })
  })
})
