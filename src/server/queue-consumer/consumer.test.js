import { Consumer } from 'sqs-consumer'
import { GetQueueUrlCommand } from '@aws-sdk/client-sqs'

import { createCommandQueueConsumer } from './consumer.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'

vi.mock('sqs-consumer')
vi.mock('@aws-sdk/client-sqs', () => ({
  GetQueueUrlCommand: vi.fn()
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
      send: vi.fn().mockResolvedValue({
        QueueUrl: 'http://localhost:4566/000000000000/test-queue'
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
          'Resolved queue URL: http://localhost:4566/000000000000/test-queue',
        queueName: 'test-queue'
      })
    })

    it('throws if queue not found', async () => {
      sqsClient.send.mockResolvedValue({ QueueUrl: undefined })

      await expect(createConsumer()).rejects.toThrow(
        'Queue not found: test-queue'
      )
    })
  })

  describe('consumer creation', () => {
    it('creates consumer with resolved queue URL and SQS client', async () => {
      await createConsumer()

      expect(Consumer.create).toHaveBeenCalledWith({
        queueUrl: 'http://localhost:4566/000000000000/test-queue',
        sqs: sqsClient,
        handleMessage: expect.any(Function)
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
  })

  describe('message handling', () => {
    let handleMessage

    beforeEach(async () => {
      await createConsumer()
      handleMessage = Consumer.create.mock.calls[0][0].handleMessage
    })

    describe('message parsing', () => {
      it('handles invalid JSON gracefully', async () => {
        const message = {
          MessageId: 'msg-123',
          Body: 'not valid json'
        }

        await handleMessage(message)

        expect(logger.error).toHaveBeenCalledWith({
          message: 'Failed to parse SQS message body',
          messageId: 'msg-123',
          event: {
            category: LOGGING_EVENT_CATEGORIES.SERVER,
            action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
          }
        })
      })

      it('handles missing body', async () => {
        const message = { MessageId: 'msg-123' }

        await handleMessage(message)

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Invalid command message: "command" is required'
          })
        )
      })

      it('handles missing command field', async () => {
        const message = {
          MessageId: 'msg-123',
          Body: JSON.stringify({ summaryLogId: 'log-123' })
        }

        await handleMessage(message)

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Invalid command message: "command" is required'
          })
        )
      })

      it('handles missing summaryLogId field', async () => {
        const message = {
          MessageId: 'msg-123',
          Body: JSON.stringify({ command: 'validate' })
        }

        await handleMessage(message)

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Invalid command message: "summaryLogId" is required'
          })
        )
      })

      it('handles invalid command type', async () => {
        const message = {
          MessageId: 'msg-123',
          Body: JSON.stringify({ command: 'unknown', summaryLogId: 'log-123' })
        }

        await handleMessage(message)

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            message:
              'Invalid command message: "command" must be one of [validate, submit]'
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
            message: 'Command completed: validate for summaryLogId=log-123'
          })
        )
      })

      it('marks as validation_failed when validate command fails', async () => {
        const mockValidator = vi
          .fn()
          .mockRejectedValue(new Error('Validation failed'))
        vi.mocked(createSummaryLogsValidator).mockReturnValue(mockValidator)

        summaryLogsRepository.findById.mockResolvedValue({
          version: 1,
          summaryLog: { status: SUMMARY_LOG_STATUS.VALIDATING }
        })

        const message = {
          MessageId: 'msg-123',
          Body: JSON.stringify({ command: 'validate', summaryLogId: 'log-123' })
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
          .mockRejectedValue(new Error('Validation failed'))
        vi.mocked(createSummaryLogsValidator).mockReturnValue(mockValidator)

        summaryLogsRepository.findById.mockResolvedValue(null)

        const message = {
          MessageId: 'msg-123',
          Body: JSON.stringify({ command: 'validate', summaryLogId: 'log-123' })
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
          .mockRejectedValue(new Error('Validation failed'))
        vi.mocked(createSummaryLogsValidator).mockReturnValue(mockValidator)

        summaryLogsRepository.findById.mockResolvedValue({
          version: 1,
          summaryLog: { status: SUMMARY_LOG_STATUS.VALIDATED }
        })

        const message = {
          MessageId: 'msg-123',
          Body: JSON.stringify({ command: 'validate', summaryLogId: 'log-123' })
        }

        await handleMessage(message)

        expect(summaryLogsRepository.update).not.toHaveBeenCalled()
      })

      it('logs error when marking as failed fails', async () => {
        const mockValidator = vi
          .fn()
          .mockRejectedValue(new Error('Validation failed'))
        vi.mocked(createSummaryLogsValidator).mockReturnValue(mockValidator)

        summaryLogsRepository.findById.mockResolvedValue({
          version: 1,
          summaryLog: { status: SUMMARY_LOG_STATUS.VALIDATING }
        })
        const updateError = new Error('Database error')
        summaryLogsRepository.update.mockRejectedValue(updateError)

        const message = {
          MessageId: 'msg-123',
          Body: JSON.stringify({ command: 'validate', summaryLogId: 'log-123' })
        }

        await handleMessage(message)

        expect(logger.error).toHaveBeenCalledWith({
          err: updateError,
          message:
            'Failed to mark summary log as validation_failed, summaryLogId=log-123'
        })
      })
    })

    describe('submit command', () => {
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
          Body: JSON.stringify({ command: 'submit', summaryLogId: 'log-123' })
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
          Body: JSON.stringify({ command: 'submit', summaryLogId: 'log-123' })
        }

        await handleMessage(message)

        expect(summaryLogMetrics.timedSubmission).toHaveBeenCalled()
        expect(summaryLogMetrics.recordWasteRecordsCreated).toHaveBeenCalled()
        expect(summaryLogMetrics.recordWasteRecordsUpdated).toHaveBeenCalled()
        expect(summaryLogMetrics.recordStatusTransition).toHaveBeenCalled()
      })

      it('throws and marks as failed when summary log not found', async () => {
        summaryLogsRepository.findById.mockResolvedValueOnce(null)
        summaryLogsRepository.findById.mockResolvedValueOnce(null)

        const message = {
          MessageId: 'msg-123',
          Body: JSON.stringify({ command: 'submit', summaryLogId: 'log-123' })
        }

        await handleMessage(message)

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Command failed: submit for summaryLogId=log-123'
          })
        )
        expect(logger.warn).toHaveBeenCalledWith({
          message:
            'Cannot mark as submission_failed: summary log not found, summaryLogId=log-123'
        })
      })

      it('throws when summary log not in submitting status', async () => {
        summaryLogsRepository.findById.mockResolvedValue({
          version: 1,
          summaryLog: { status: SUMMARY_LOG_STATUS.VALIDATED }
        })

        const message = {
          MessageId: 'msg-123',
          Body: JSON.stringify({ command: 'submit', summaryLogId: 'log-123' })
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

      it('marks as submission_failed when submit command fails', async () => {
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
          Body: JSON.stringify({ command: 'submit', summaryLogId: 'log-123' })
        }

        await handleMessage(message)

        expect(summaryLogsRepository.update).toHaveBeenCalledWith(
          'log-123',
          1,
          expect.objectContaining({
            status: SUMMARY_LOG_STATUS.SUBMISSION_FAILED
          })
        )
      })

      it('skips marking as submission_failed if not in submitting status', async () => {
        const syncError = new Error('Sync failed')
        vi.mocked(summaryLogMetrics).timedSubmission.mockRejectedValue(
          syncError
        )

        summaryLogsRepository.findById
          .mockResolvedValueOnce({
            version: 1,
            summaryLog: { status: SUMMARY_LOG_STATUS.SUBMITTING, meta: {} }
          })
          .mockResolvedValueOnce({
            version: 2,
            summaryLog: { status: SUMMARY_LOG_STATUS.SUBMITTED }
          })

        const message = {
          MessageId: 'msg-123',
          Body: JSON.stringify({ command: 'submit', summaryLogId: 'log-123' })
        }

        await handleMessage(message)

        expect(summaryLogsRepository.update).not.toHaveBeenCalled()
      })

      it('logs error when marking as submission_failed fails', async () => {
        const syncError = new Error('Sync failed')
        vi.mocked(summaryLogMetrics).timedSubmission.mockRejectedValue(
          syncError
        )

        const updateError = new Error('Database error')
        summaryLogsRepository.findById.mockResolvedValue({
          version: 1,
          summaryLog: { status: SUMMARY_LOG_STATUS.SUBMITTING, meta: {} }
        })
        summaryLogsRepository.update.mockRejectedValue(updateError)

        const message = {
          MessageId: 'msg-123',
          Body: JSON.stringify({ command: 'submit', summaryLogId: 'log-123' })
        }

        await handleMessage(message)

        expect(logger.error).toHaveBeenCalledWith({
          err: updateError,
          message:
            'Failed to mark summary log as submission_failed, summaryLogId=log-123'
        })
      })
    })
  })
})
