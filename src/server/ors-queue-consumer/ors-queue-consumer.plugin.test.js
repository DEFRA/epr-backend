import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { orsQueueConsumerPlugin } from './ors-queue-consumer.plugin.js'

vi.mock('#common/helpers/sqs/sqs-client.js')
vi.mock('./consumer.js')

const { createSqsClient } = await import('#common/helpers/sqs/sqs-client.js')
const { createOrsQueueConsumer } = await import('./consumer.js')

describe('orsQueueConsumerPlugin', () => {
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
        orsImportsRepository: {},
        overseasSitesRepository: {},
        organisationsRepository: {},
        uploadsRepository: {}
      },
      featureFlags: {
        isOverseasSitesEnabled: vi.fn().mockReturnValue(true)
      }
    }

    config = {
      get: vi.fn((key) => {
        const values = {
          awsRegion: 'eu-west-2',
          'orsImportQueue.endpoint': 'http://localhost:4566',
          'orsImportQueue.queueName': 'ors-test-queue'
        }
        return values[key]
      })
    }

    mockSqsClient = { destroy: vi.fn() }
    mockConsumer = { start: vi.fn(), stop: vi.fn() }

    vi.mocked(createSqsClient).mockReturnValue(mockSqsClient)
    vi.mocked(createOrsQueueConsumer).mockResolvedValue(mockConsumer)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('has correct plugin metadata', () => {
    expect(orsQueueConsumerPlugin.name).toBe('ors-queue-consumer')
    expect(orsQueueConsumerPlugin.version).toBe('1.0.0')
    expect(orsQueueConsumerPlugin.dependencies).toContain(
      'orsImportsRepository'
    )
    expect(orsQueueConsumerPlugin.dependencies).toContain('uploadsRepository')
  })

  describe('plugin registration', () => {
    it('creates SQS client with correct config', async () => {
      await orsQueueConsumerPlugin.register(server, { config })

      expect(createSqsClient).toHaveBeenCalledWith({
        region: 'eu-west-2',
        endpoint: 'http://localhost:4566'
      })
    })

    it('registers start event handler', async () => {
      await orsQueueConsumerPlugin.register(server, { config })

      expect(server.events.on).toHaveBeenCalledWith(
        'start',
        expect.any(Function)
      )
    })

    it('registers stop event handler', async () => {
      await orsQueueConsumerPlugin.register(server, { config })

      expect(server.events.on).toHaveBeenCalledWith(
        'stop',
        expect.any(Function)
      )
    })
  })

  describe('server start event', () => {
    it('creates consumer and starts it when feature flag is enabled', async () => {
      await orsQueueConsumerPlugin.register(server, { config })

      const startHandler = server.events.on.mock.calls.find(
        (call) => call[0] === 'start'
      )[1]
      await startHandler()

      expect(createOrsQueueConsumer).toHaveBeenCalledWith({
        sqsClient: mockSqsClient,
        queueName: 'ors-test-queue',
        logger: server.logger,
        orsImportsRepository: server.app.orsImportsRepository,
        uploadsRepository: server.app.uploadsRepository,
        overseasSitesRepository: server.app.overseasSitesRepository,
        organisationsRepository: server.app.organisationsRepository
      })
      expect(server.logger.info).toHaveBeenCalledWith({
        message: 'Starting ORS SQS queue consumer for queue: ors-test-queue',
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.START_SUCCESS
        }
      })
      expect(mockConsumer.start).toHaveBeenCalled()
    })

    it('skips consumer creation when feature flag is disabled', async () => {
      server.featureFlags.isOverseasSitesEnabled.mockReturnValue(false)

      await orsQueueConsumerPlugin.register(server, { config })

      const startHandler = server.events.on.mock.calls.find(
        (call) => call[0] === 'start'
      )[1]
      await startHandler()

      expect(createOrsQueueConsumer).not.toHaveBeenCalled()
      expect(mockConsumer.start).not.toHaveBeenCalled()
      expect(server.logger.info).toHaveBeenCalledWith({
        message: 'ORS queue consumer disabled by feature flag'
      })
    })
  })

  describe('server stop event', () => {
    it('stops consumer and destroys SQS client', async () => {
      await orsQueueConsumerPlugin.register(server, { config })

      const startHandler = server.events.on.mock.calls.find(
        (call) => call[0] === 'start'
      )[1]
      await startHandler()

      const stopHandler = server.events.on.mock.calls.find(
        (call) => call[0] === 'stop'
      )[1]
      await stopHandler()

      expect(server.logger.info).toHaveBeenCalledWith({
        message: 'Stopping ORS SQS queue consumer',
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.CONNECTION_CLOSING
        }
      })
      expect(mockConsumer.stop).toHaveBeenCalled()
      expect(mockSqsClient.destroy).toHaveBeenCalled()
      expect(server.logger.info).toHaveBeenCalledWith({
        message: 'ORS SQS queue consumer stopped',
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.CONNECTION_CLOSING_SUCCESS
        }
      })
    })

    it('handles stop when consumer was never started', async () => {
      await orsQueueConsumerPlugin.register(server, { config })

      const stopHandler = server.events.on.mock.calls.find(
        (call) => call[0] === 'stop'
      )[1]
      await stopHandler()

      expect(mockConsumer.stop).not.toHaveBeenCalled()
      expect(mockSqsClient.destroy).toHaveBeenCalled()
    })
  })
})
