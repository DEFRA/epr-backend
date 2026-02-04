import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { createSqsCommandExecutor } from './sqs-command-executor.js'

describe('createSqsCommandExecutor', () => {
  let executor
  let logger
  let sqsClient
  let sentMessages

  beforeEach(async () => {
    logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    }

    sentMessages = []

    sqsClient = {
      send: vi.fn().mockImplementation((command) => {
        // Track sent messages for assertions
        if (command.constructor.name === 'SendMessageCommand') {
          sentMessages.push(command)
        }
        return Promise.resolve({
          QueueUrl: 'https://sqs.eu-west-2.amazonaws.com/123456789/test-queue'
        })
      })
    }

    executor = await createSqsCommandExecutor({
      sqsClient,
      queueName: 'test-queue',
      logger
    })
  })

  it('resolves queue URL on creation', async () => {
    expect(sqsClient.send).toHaveBeenCalled()
    const firstCall = sqsClient.send.mock.calls[0][0]
    expect(firstCall.constructor.name).toBe('GetQueueUrlCommand')
  })

  it('logs resolved queue URL', async () => {
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Resolved queue URL'),
        queueName: 'test-queue'
      })
    )
  })

  it('throws when queue URL cannot be resolved', async () => {
    sqsClient.send.mockResolvedValue({ QueueUrl: null })

    await expect(
      createSqsCommandExecutor({
        sqsClient,
        queueName: 'missing-queue',
        logger
      })
    ).rejects.toThrow('Queue not found: missing-queue')
  })

  it('creates command executor instance', () => {
    expect(executor).toBeDefined()
    expect(executor.validate).toBeInstanceOf(Function)
    expect(executor.submit).toBeInstanceOf(Function)
  })

  describe('validate', () => {
    it('sends validate command to SQS', async () => {
      await executor.validate('summary-log-123')

      expect(sentMessages).toHaveLength(1)
      expect(sentMessages[0].constructor.name).toBe('SendMessageCommand')
    })

    it('sends correct message body', async () => {
      await executor.validate('summary-log-123')

      expect(sentMessages).toHaveLength(1)
      expect(JSON.parse(sentMessages[0].input.MessageBody)).toEqual({
        command: 'validate',
        summaryLogId: 'summary-log-123'
      })
    })

    it('logs success after sending', async () => {
      await executor.validate('summary-log-123')

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Sent validate command for summaryLogId=summary-log-123',
          summaryLogId: 'summary-log-123',
          event: {
            category: LOGGING_EVENT_CATEGORIES.SERVER,
            action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
          }
        })
      )
    })
  })

  describe('submit', () => {
    it('sends submit command to SQS', async () => {
      await executor.submit('summary-log-456')

      expect(sentMessages).toHaveLength(1)
      expect(sentMessages[0].constructor.name).toBe('SendMessageCommand')
    })

    it('sends correct message body without user when no request', async () => {
      await executor.submit('summary-log-456')

      expect(sentMessages).toHaveLength(1)
      expect(JSON.parse(sentMessages[0].input.MessageBody)).toEqual({
        command: 'submit',
        summaryLogId: 'summary-log-456'
      })
    })

    it('includes user in message when request has credentials', async () => {
      const mockRequest = {
        auth: {
          credentials: {
            id: 'user-123',
            email: 'test@example.com',
            scope: ['admin', 'user']
          }
        }
      }

      await executor.submit('summary-log-456', mockRequest)

      expect(sentMessages).toHaveLength(1)
      expect(JSON.parse(sentMessages[0].input.MessageBody)).toEqual({
        command: 'submit',
        summaryLogId: 'summary-log-456',
        user: {
          id: 'user-123',
          email: 'test@example.com',
          scope: ['admin', 'user']
        }
      })
    })

    it('omits user when request has no auth', async () => {
      const mockRequest = {}

      await executor.submit('summary-log-456', mockRequest)

      expect(sentMessages).toHaveLength(1)
      expect(JSON.parse(sentMessages[0].input.MessageBody)).toEqual({
        command: 'submit',
        summaryLogId: 'summary-log-456'
      })
    })

    it('omits user when request auth has no credentials', async () => {
      const mockRequest = { auth: {} }

      await executor.submit('summary-log-456', mockRequest)

      expect(sentMessages).toHaveLength(1)
      expect(JSON.parse(sentMessages[0].input.MessageBody)).toEqual({
        command: 'submit',
        summaryLogId: 'summary-log-456'
      })
    })

    it('logs success after sending', async () => {
      await executor.submit('summary-log-456')

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Sent submit command for summaryLogId=summary-log-456',
          summaryLogId: 'summary-log-456',
          event: {
            category: LOGGING_EVENT_CATEGORIES.SERVER,
            action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
          }
        })
      )
    })
  })
})
