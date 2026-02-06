import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { commandQueueConsumerPlugin } from './queue-consumer.plugin.js'

vi.mock('#common/helpers/sqs/sqs-client.js')
vi.mock('#application/summary-logs/extractor.js')
vi.mock('./consumer.js')

const { createSqsClient } = await import('#common/helpers/sqs/sqs-client.js')
const { createSummaryLogExtractor } =
  await import('#application/summary-logs/extractor.js')
const { createCommandQueueConsumer } = await import('./consumer.js')

describe('commandQueueConsumerPlugin', () => {
  let server
  let config
  let mockSqsClient
  let mockConsumer

  beforeEach(() => {
    server = {
      logger: {
        info: vi.fn(),
        error: vi.fn()
      },
      events: {
        on: vi.fn()
      },
      app: {
        summaryLogsRepository: {},
        organisationsRepository: {},
        wasteRecordsRepository: {},
        wasteBalancesRepository: {},
        uploadsRepository: {}
      }
    }

    config = {
      get: vi.fn((key) => {
        const values = {
          awsRegion: 'eu-west-2',
          'commandQueue.endpoint': 'http://localhost:4566',
          'commandQueue.queueName': 'test-queue'
        }
        return values[key]
      })
    }

    mockSqsClient = { destroy: vi.fn() }
    mockConsumer = { start: vi.fn(), stop: vi.fn() }

    vi.mocked(createSqsClient).mockReturnValue(mockSqsClient)
    vi.mocked(createSummaryLogExtractor).mockReturnValue({})
    vi.mocked(createCommandQueueConsumer).mockResolvedValue(mockConsumer)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('has correct plugin metadata', () => {
    expect(commandQueueConsumerPlugin.name).toBe('command-queue-consumer')
    expect(commandQueueConsumerPlugin.version).toBe('1.0.0')
    expect(commandQueueConsumerPlugin.dependencies).toContain(
      'summaryLogsRepository'
    )
    expect(commandQueueConsumerPlugin.dependencies).toContain(
      'uploadsRepository'
    )
  })

  describe('plugin registration', () => {
    it('creates SQS client with correct config', async () => {
      await commandQueueConsumerPlugin.register(server, { config })

      expect(createSqsClient).toHaveBeenCalledWith({
        region: 'eu-west-2',
        endpoint: 'http://localhost:4566'
      })
    })

    it('creates summary log extractor', async () => {
      await commandQueueConsumerPlugin.register(server, { config })

      expect(createSummaryLogExtractor).toHaveBeenCalledWith({
        uploadsRepository: expect.any(Object),
        logger: server.logger
      })
    })

    it('registers start event handler', async () => {
      await commandQueueConsumerPlugin.register(server, { config })

      expect(server.events.on).toHaveBeenCalledWith(
        'start',
        expect.any(Function)
      )
    })

    it('registers stop event handler', async () => {
      await commandQueueConsumerPlugin.register(server, { config })

      expect(server.events.on).toHaveBeenCalledWith(
        'stop',
        expect.any(Function)
      )
    })
  })

  describe('server start event', () => {
    it('creates consumer and starts it', async () => {
      await commandQueueConsumerPlugin.register(server, { config })

      const startHandler = server.events.on.mock.calls.find(
        (call) => call[0] === 'start'
      )[1]
      await startHandler()

      expect(createCommandQueueConsumer).toHaveBeenCalledWith({
        sqsClient: mockSqsClient,
        queueName: 'test-queue',
        logger: server.logger,
        summaryLogsRepository: server.app.summaryLogsRepository,
        organisationsRepository: server.app.organisationsRepository,
        wasteRecordsRepository: server.app.wasteRecordsRepository,
        wasteBalancesRepository: server.app.wasteBalancesRepository,
        summaryLogExtractor: expect.any(Object)
      })
      expect(server.logger.info).toHaveBeenCalledWith({
        message: 'Starting SQS command queue consumer for queue: test-queue',
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.START_SUCCESS
        }
      })
      expect(mockConsumer.start).toHaveBeenCalled()
    })
  })

  describe('server stop event', () => {
    it('stops consumer and destroys SQS client', async () => {
      await commandQueueConsumerPlugin.register(server, { config })

      // Start first to create consumer
      const startHandler = server.events.on.mock.calls.find(
        (call) => call[0] === 'start'
      )[1]
      await startHandler()

      const stopHandler = server.events.on.mock.calls.find(
        (call) => call[0] === 'stop'
      )[1]
      await stopHandler()

      expect(server.logger.info).toHaveBeenCalledWith({
        message: 'Stopping SQS command queue consumer',
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.CONNECTION_CLOSING
        }
      })
      expect(mockConsumer.stop).toHaveBeenCalled()
      expect(mockSqsClient.destroy).toHaveBeenCalled()
      expect(server.logger.info).toHaveBeenCalledWith({
        message: 'SQS command queue consumer stopped',
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.CONNECTION_CLOSING_SUCCESS
        }
      })
    })

    it('handles stop when consumer was never started', async () => {
      await commandQueueConsumerPlugin.register(server, { config })

      const stopHandler = server.events.on.mock.calls.find(
        (call) => call[0] === 'stop'
      )[1]
      await stopHandler()

      expect(mockConsumer.stop).not.toHaveBeenCalled()
      expect(mockSqsClient.destroy).toHaveBeenCalled()
    })
  })
})
