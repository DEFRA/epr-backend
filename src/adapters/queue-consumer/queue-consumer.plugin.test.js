import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { commandQueueConsumerPlugin } from './queue-consumer.plugin.js'

vi.mock('#common/helpers/sqs/sqs-client.js')
vi.mock('#common/helpers/s3/s3-client.js')
vi.mock('#adapters/repositories/uploads/cdp-uploader.js')
vi.mock('#application/summary-logs/extractor.js')
vi.mock('./consumer.js')

const { createSqsClient } = await import('#common/helpers/sqs/sqs-client.js')
const { createS3Client } = await import('#common/helpers/s3/s3-client.js')
const { createUploadsRepository } = await import(
  '#adapters/repositories/uploads/cdp-uploader.js'
)
const { createSummaryLogExtractor } = await import(
  '#application/summary-logs/extractor.js'
)
const { createCommandQueueConsumer } = await import('./consumer.js')

describe('commandQueueConsumerPlugin', () => {
  let server
  let config
  let mockSqsClient
  let mockS3Client
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
        featureFlags: {}
      }
    }

    config = {
      get: vi.fn((key) => {
        const values = {
          awsRegion: 'eu-west-2',
          'commandQueue.endpoint': 'http://localhost:4566',
          'commandQueue.queueName': 'test-queue',
          s3Endpoint: 'http://localhost:4566',
          isDevelopment: true,
          'cdpUploader.url': 'http://localhost:7337',
          'cdpUploader.s3Bucket': 'cdp-uploader-quarantine'
        }
        return values[key]
      })
    }

    mockSqsClient = { destroy: vi.fn() }
    mockS3Client = { destroy: vi.fn() }
    mockConsumer = { start: vi.fn(), stop: vi.fn() }

    vi.mocked(createSqsClient).mockReturnValue(mockSqsClient)
    vi.mocked(createS3Client).mockReturnValue(mockS3Client)
    vi.mocked(createUploadsRepository).mockReturnValue({})
    vi.mocked(createSummaryLogExtractor).mockReturnValue({})
    vi.mocked(createCommandQueueConsumer).mockResolvedValue(mockConsumer)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('has correct plugin metadata', () => {
    expect(commandQueueConsumerPlugin.name).toBe('command-queue-consumer')
    expect(commandQueueConsumerPlugin.version).toBe('1.0.0')
    expect(commandQueueConsumerPlugin.dependencies).toContain('mongodb')
    expect(commandQueueConsumerPlugin.dependencies).toContain('summaryLogsRepository')
    expect(commandQueueConsumerPlugin.dependencies).toContain('feature-flags')
  })

  describe('plugin registration', () => {
    it('creates SQS client with correct config', async () => {
      await commandQueueConsumerPlugin.register(server, { config })

      expect(createSqsClient).toHaveBeenCalledWith({
        region: 'eu-west-2',
        endpoint: 'http://localhost:4566'
      })
    })

    it('creates S3 client with correct config', async () => {
      await commandQueueConsumerPlugin.register(server, { config })

      expect(createS3Client).toHaveBeenCalledWith({
        region: 'eu-west-2',
        endpoint: 'http://localhost:4566',
        forcePathStyle: true
      })
    })

    it('creates uploads repository', async () => {
      await commandQueueConsumerPlugin.register(server, { config })

      expect(createUploadsRepository).toHaveBeenCalledWith({
        s3Client: mockS3Client,
        cdpUploaderUrl: 'http://localhost:7337',
        s3Bucket: 'cdp-uploader-quarantine'
      })
    })

    it('creates summary log extractor', async () => {
      await commandQueueConsumerPlugin.register(server, { config })

      expect(createSummaryLogExtractor).toHaveBeenCalledWith({
        uploadsRepository: expect.any(Object),
        logger: server.logger
      })
    })

    it('creates command queue consumer with dependencies', async () => {
      await commandQueueConsumerPlugin.register(server, { config })

      expect(createCommandQueueConsumer).toHaveBeenCalledWith({
        sqsClient: mockSqsClient,
        queueName: 'test-queue',
        logger: server.logger,
        summaryLogsRepository: server.app.summaryLogsRepository,
        organisationsRepository: server.app.organisationsRepository,
        wasteRecordsRepository: server.app.wasteRecordsRepository,
        wasteBalancesRepository: server.app.wasteBalancesRepository,
        summaryLogExtractor: expect.any(Object),
        featureFlags: server.app.featureFlags
      })
    })

    it('registers start event handler', async () => {
      await commandQueueConsumerPlugin.register(server, { config })

      expect(server.events.on).toHaveBeenCalledWith('start', expect.any(Function))
    })

    it('registers stop event handler', async () => {
      await commandQueueConsumerPlugin.register(server, { config })

      expect(server.events.on).toHaveBeenCalledWith('stop', expect.any(Function))
    })
  })

  describe('server start event', () => {
    it('starts consumer and logs', async () => {
      await commandQueueConsumerPlugin.register(server, { config })

      const startHandler = server.events.on.mock.calls.find(
        (call) => call[0] === 'start'
      )[1]
      startHandler()

      expect(server.logger.info).toHaveBeenCalledWith({
        message: 'Starting SQS command queue consumer',
        queueName: 'test-queue',
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.START_SUCCESS
        }
      })
      expect(mockConsumer.start).toHaveBeenCalled()
    })
  })

  describe('server stop event', () => {
    it('stops consumer and destroys clients', async () => {
      await commandQueueConsumerPlugin.register(server, { config })

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
      expect(mockS3Client.destroy).toHaveBeenCalled()
      expect(server.logger.info).toHaveBeenCalledWith({
        message: 'SQS command queue consumer stopped',
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.CONNECTION_CLOSING_SUCCESS
        }
      })
    })
  })
})
