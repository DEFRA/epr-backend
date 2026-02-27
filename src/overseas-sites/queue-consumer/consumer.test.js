import { Consumer } from 'sqs-consumer'
import {
  GetQueueUrlCommand,
  GetQueueAttributesCommand
} from '@aws-sdk/client-sqs'

import { createOrsQueueConsumer } from './consumer.js'
import { ORS_IMPORT_STATUS } from '../domain/import-status.js'
import { PermanentError } from '#server/queue-consumer/permanent-error.js'

vi.mock('sqs-consumer')
vi.mock('@aws-sdk/client-sqs', () => ({
  GetQueueUrlCommand: vi.fn(),
  GetQueueAttributesCommand: vi.fn()
}))
vi.mock('../application/process-import.js')

const { processOrsImport } = await import('../application/process-import.js')

describe('createOrsQueueConsumer', () => {
  let sqsClient
  let logger
  let orsImportsRepository
  let uploadsRepository
  let overseasSitesRepository
  let organisationsRepository
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
          QueueUrl: 'http://localhost:4566/000000000000/ors-queue'
        })
      })
    }

    logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    }

    orsImportsRepository = {
      findById: vi.fn(),
      updateStatus: vi.fn(),
      recordFileResult: vi.fn()
    }

    uploadsRepository = {}
    overseasSitesRepository = {}
    organisationsRepository = {}

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
    vi.mocked(processOrsImport).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  const createConsumer = () =>
    createOrsQueueConsumer({
      sqsClient,
      queueName: 'ors-test-queue',
      logger,
      orsImportsRepository,
      uploadsRepository,
      overseasSitesRepository,
      organisationsRepository
    })

  describe('queue URL resolution', () => {
    it('looks up queue URL by name', async () => {
      await createConsumer()

      expect(sqsClient.send).toHaveBeenCalledWith({
        QueueName: 'ors-test-queue'
      })
    })
  })

  describe('message handling', () => {
    it('processes a valid process command', async () => {
      await createConsumer()

      const handleMessage = vi.mocked(Consumer.create).mock.calls[0][0]
        .handleMessage

      const message = {
        MessageId: 'msg-1',
        Body: JSON.stringify({ command: 'process', importId: 'import-abc' }),
        Attributes: { ApproximateReceiveCount: '1' }
      }

      await handleMessage(message)

      expect(processOrsImport).toHaveBeenCalledWith('import-abc', {
        orsImportsRepository,
        uploadsRepository,
        overseasSitesRepository,
        organisationsRepository,
        logger
      })
    })

    it('rejects unparseable JSON in message body', async () => {
      await createConsumer()

      const handleMessage = vi.mocked(Consumer.create).mock.calls[0][0]
        .handleMessage

      const message = {
        MessageId: 'msg-bad-json',
        Body: '{not-valid-json',
        Attributes: { ApproximateReceiveCount: '1' }
      }

      await expect(handleMessage(message)).rejects.toThrow(
        'Unparseable command message'
      )
    })

    it('handles null MessageId and Body gracefully', async () => {
      await createConsumer()

      const handleMessage = vi.mocked(Consumer.create).mock.calls[0][0]
        .handleMessage

      const message = {
        Attributes: { ApproximateReceiveCount: '1' }
      }

      await expect(handleMessage(message)).rejects.toThrow(
        'Unparseable command message'
      )
    })

    it('rejects invalid command messages', async () => {
      await createConsumer()

      const handleMessage = vi.mocked(Consumer.create).mock.calls[0][0]
        .handleMessage

      const message = {
        MessageId: 'msg-bad',
        Body: JSON.stringify({ command: 'invalid' }),
        Attributes: { ApproximateReceiveCount: '1' }
      }

      await expect(handleMessage(message)).rejects.toThrow(
        'Unparseable command message'
      )
    })

    it('marks import as failed on PermanentError', async () => {
      await createConsumer()

      const handleMessage = vi.mocked(Consumer.create).mock.calls[0][0]
        .handleMessage

      vi.mocked(processOrsImport).mockRejectedValue(
        new PermanentError('Import not found')
      )

      const message = {
        MessageId: 'msg-perm',
        Body: JSON.stringify({ command: 'process', importId: 'import-xyz' }),
        Attributes: { ApproximateReceiveCount: '1' }
      }

      const result = await handleMessage(message)

      // PermanentError should be caught and message acknowledged
      expect(result).toBe(message)
      expect(orsImportsRepository.updateStatus).toHaveBeenCalledWith(
        'import-xyz',
        ORS_IMPORT_STATUS.FAILED
      )
    })

    it('rethrows transient errors for SQS retry', async () => {
      await createConsumer()

      const handleMessage = vi.mocked(Consumer.create).mock.calls[0][0]
        .handleMessage

      vi.mocked(processOrsImport).mockRejectedValue(
        new Error('DB connection lost')
      )

      const message = {
        MessageId: 'msg-trans',
        Body: JSON.stringify({ command: 'process', importId: 'import-xyz' }),
        Attributes: { ApproximateReceiveCount: '1' }
      }

      await expect(handleMessage(message)).rejects.toThrow('DB connection lost')
    })

    it('handles missing Attributes on transient error', async () => {
      await createConsumer()

      const handleMessage = vi.mocked(Consumer.create).mock.calls[0][0]
        .handleMessage

      vi.mocked(processOrsImport).mockRejectedValue(
        new Error('DB connection lost')
      )

      const message = {
        MessageId: 'msg-no-attrs',
        Body: JSON.stringify({ command: 'process', importId: 'import-xyz' })
        // No Attributes — tests the ?? 0 fallback
      }

      await expect(handleMessage(message)).rejects.toThrow('DB connection lost')
    })

    it('marks as failed on final transient attempt', async () => {
      await createConsumer()

      const handleMessage = vi.mocked(Consumer.create).mock.calls[0][0]
        .handleMessage

      vi.mocked(processOrsImport).mockRejectedValue(
        new Error('DB connection lost')
      )

      const message = {
        MessageId: 'msg-final',
        Body: JSON.stringify({ command: 'process', importId: 'import-xyz' }),
        Attributes: { ApproximateReceiveCount: '2' }
      }

      // Final attempt should mark as failed but still rethrow
      await expect(handleMessage(message)).rejects.toThrow('DB connection lost')
      expect(orsImportsRepository.updateStatus).toHaveBeenCalledWith(
        'import-xyz',
        ORS_IMPORT_STATUS.FAILED
      )
    })
  })

  it('logs but does not rethrow when marking import as failed throws', async () => {
    await createConsumer()

    const handleMessage = vi.mocked(Consumer.create).mock.calls[0][0]
      .handleMessage

    vi.mocked(processOrsImport).mockRejectedValue(
      new PermanentError('Import not found')
    )
    orsImportsRepository.updateStatus.mockRejectedValue(
      new Error('DB write error')
    )

    const message = {
      MessageId: 'msg-double-fail',
      Body: JSON.stringify({ command: 'process', importId: 'import-xyz' }),
      Attributes: { ApproximateReceiveCount: '1' }
    }

    // Should not throw — permanent errors are swallowed
    const result = await handleMessage(message)
    expect(result).toBe(message)
    expect(logger.error).toHaveBeenCalled()
  })

  describe('queue configuration', () => {
    it('warns when no redrive policy configured', async () => {
      sqsClient.send.mockImplementation((command) => {
        if (command instanceof GetQueueAttributesCommand) {
          return Promise.resolve({ Attributes: {} })
        }
        return Promise.resolve({
          QueueUrl: 'http://localhost:4566/000000000000/ors-queue'
        })
      })

      await createConsumer()

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('No redrive policy configured')
        })
      )
    })
  })

  describe('event handlers', () => {
    it('logs consumer-level errors', async () => {
      await createConsumer()

      const errorHandler = eventHandlers['error']
      errorHandler(new Error('SQS connection issue'))

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'ORS SQS consumer error'
        })
      )
    })

    it('logs processing errors', async () => {
      await createConsumer()

      const processingErrorHandler = eventHandlers['processing_error']
      processingErrorHandler(new Error('Message processing failed'))

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'ORS SQS message processing error'
        })
      )
    })

    it('marks as failed on timeout with valid command', async () => {
      await createConsumer()

      const timeoutHandler = eventHandlers['timeout_error']

      const message = {
        MessageId: 'msg-timeout',
        Body: JSON.stringify({ command: 'process', importId: 'import-abc' }),
        Attributes: {}
      }

      await timeoutHandler(new Error('timeout'), message)

      expect(orsImportsRepository.updateStatus).toHaveBeenCalledWith(
        'import-abc',
        ORS_IMPORT_STATUS.FAILED
      )
    })

    it('handles timeout with unparseable message', async () => {
      await createConsumer()

      const timeoutHandler = eventHandlers['timeout_error']

      const message = {
        MessageId: 'msg-timeout-bad',
        Body: '{not-json',
        Attributes: {}
      }

      await timeoutHandler(new Error('timeout'), message)

      // Should not call updateStatus — couldn't parse importId
      expect(orsImportsRepository.updateStatus).not.toHaveBeenCalled()
      expect(logger.error).toHaveBeenCalled()
    })
  })
})
