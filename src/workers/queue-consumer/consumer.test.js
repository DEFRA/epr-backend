import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createCommandQueueConsumer } from './consumer.js'

describe('createCommandQueueConsumer', () => {
  const mockQueueUrl =
    'https://sqs.eu-west-2.amazonaws.com/123456789/test-queue'

  const createMockSqsClient = () => ({
    send: vi.fn().mockResolvedValue({ QueueUrl: mockQueueUrl })
  })

  const createMockLogger = () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })

  let mockSqsClient
  let mockLogger
  let handleValidateCommand
  let handleSubmitCommand

  beforeEach(() => {
    mockSqsClient = createMockSqsClient()
    mockLogger = createMockLogger()
    handleValidateCommand = vi.fn()
    handleSubmitCommand = vi.fn()
  })

  it('resolves queue URL by name', async () => {
    const consumer = await createCommandQueueConsumer({
      sqsClient: mockSqsClient,
      queueName: 'test-queue',
      logger: mockLogger,
      handleValidateCommand,
      handleSubmitCommand
    })

    expect(mockSqsClient.send).toHaveBeenCalledTimes(1)
    expect(mockLogger.info).toHaveBeenCalledWith(
      { queueName: 'test-queue', queueUrl: mockQueueUrl },
      'Resolved command queue URL'
    )

    consumer.stop()
  })

  it('throws if queue URL not found', async () => {
    mockSqsClient.send.mockResolvedValue({ QueueUrl: undefined })

    await expect(
      createCommandQueueConsumer({
        sqsClient: mockSqsClient,
        queueName: 'missing-queue',
        logger: mockLogger,
        handleValidateCommand,
        handleSubmitCommand
      })
    ).rejects.toThrow('Queue URL not found for queue: missing-queue')
  })

  it('returns a consumer that can be started and stopped', async () => {
    const consumer = await createCommandQueueConsumer({
      sqsClient: mockSqsClient,
      queueName: 'test-queue',
      logger: mockLogger,
      handleValidateCommand,
      handleSubmitCommand
    })

    expect(consumer).toBeDefined()
    expect(typeof consumer.start).toBe('function')
    expect(typeof consumer.stop).toBe('function')

    consumer.stop()
  })

  describe('message handling', () => {
    it('dispatches validate command to handler', async () => {
      const consumer = await createCommandQueueConsumer({
        sqsClient: mockSqsClient,
        queueName: 'test-queue',
        logger: mockLogger,
        handleValidateCommand,
        handleSubmitCommand
      })

      // Simulate a message being processed
      const message = {
        MessageId: 'msg-123',
        Body: JSON.stringify({
          command: 'validate',
          summaryLogId: 'log-456'
        })
      }

      // Access the handleMessage function via the consumer's internal handler
      // We need to simulate what sqs-consumer does internally
      await consumer.handleMessage(message)

      expect(handleValidateCommand).toHaveBeenCalledWith({
        summaryLogId: 'log-456'
      })
      expect(mockLogger.info).toHaveBeenCalledWith(
        { command: 'validate', summaryLogId: 'log-456', messageId: 'msg-123' },
        'Processing command from queue'
      )

      consumer.stop()
    })

    it('dispatches submit command to handler', async () => {
      const consumer = await createCommandQueueConsumer({
        sqsClient: mockSqsClient,
        queueName: 'test-queue',
        logger: mockLogger,
        handleValidateCommand,
        handleSubmitCommand
      })

      const message = {
        MessageId: 'msg-789',
        Body: JSON.stringify({
          command: 'submit',
          summaryLogId: 'log-abc'
        })
      }

      await consumer.handleMessage(message)

      expect(handleSubmitCommand).toHaveBeenCalledWith({
        summaryLogId: 'log-abc'
      })

      consumer.stop()
    })

    it('logs warning for unknown command type', async () => {
      const consumer = await createCommandQueueConsumer({
        sqsClient: mockSqsClient,
        queueName: 'test-queue',
        logger: mockLogger,
        handleValidateCommand,
        handleSubmitCommand
      })

      const message = {
        MessageId: 'msg-unknown',
        Body: JSON.stringify({
          command: 'unknown-command',
          summaryLogId: 'log-xyz'
        })
      }

      await consumer.handleMessage(message)

      expect(handleValidateCommand).not.toHaveBeenCalled()
      expect(handleSubmitCommand).not.toHaveBeenCalled()
      expect(mockLogger.warn).toHaveBeenCalledWith(
        { command: 'unknown-command', summaryLogId: 'log-xyz' },
        'Unknown command type, skipping'
      )

      consumer.stop()
    })

    it('logs success after processing', async () => {
      const consumer = await createCommandQueueConsumer({
        sqsClient: mockSqsClient,
        queueName: 'test-queue',
        logger: mockLogger,
        handleValidateCommand,
        handleSubmitCommand
      })

      const message = {
        MessageId: 'msg-success',
        Body: JSON.stringify({
          command: 'validate',
          summaryLogId: 'log-success'
        })
      }

      await consumer.handleMessage(message)

      expect(mockLogger.info).toHaveBeenCalledWith(
        {
          command: 'validate',
          summaryLogId: 'log-success',
          messageId: 'msg-success'
        },
        'Command processed successfully'
      )

      consumer.stop()
    })
  })

  describe('event handlers', () => {
    it('logs error events', async () => {
      const consumer = await createCommandQueueConsumer({
        sqsClient: mockSqsClient,
        queueName: 'test-queue',
        logger: mockLogger,
        handleValidateCommand,
        handleSubmitCommand
      })

      const error = new Error('Test error')
      consumer.emit('error', error)

      expect(mockLogger.error).toHaveBeenCalledWith(
        { error },
        'Command queue consumer error'
      )

      consumer.stop()
    })

    it('logs processing_error events', async () => {
      const consumer = await createCommandQueueConsumer({
        sqsClient: mockSqsClient,
        queueName: 'test-queue',
        logger: mockLogger,
        handleValidateCommand,
        handleSubmitCommand
      })

      const error = new Error('Processing error')
      consumer.emit('processing_error', error)

      expect(mockLogger.error).toHaveBeenCalledWith(
        { error },
        'Command processing error'
      )

      consumer.stop()
    })

    it('logs started event', async () => {
      const consumer = await createCommandQueueConsumer({
        sqsClient: mockSqsClient,
        queueName: 'test-queue',
        logger: mockLogger,
        handleValidateCommand,
        handleSubmitCommand
      })

      consumer.emit('started')

      expect(mockLogger.info).toHaveBeenCalledWith(
        { queueName: 'test-queue' },
        'Command queue consumer started'
      )

      consumer.stop()
    })

    it('logs stopped event', async () => {
      const consumer = await createCommandQueueConsumer({
        sqsClient: mockSqsClient,
        queueName: 'test-queue',
        logger: mockLogger,
        handleValidateCommand,
        handleSubmitCommand
      })

      consumer.emit('stopped')

      expect(mockLogger.info).toHaveBeenCalledWith(
        { queueName: 'test-queue' },
        'Command queue consumer stopped'
      )

      consumer.stop()
    })
  })
})
