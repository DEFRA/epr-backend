import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { commandQueueConsumerPlugin } from './queue-consumer.plugin.js'

vi.mock('#common/helpers/sqs/sqs-client.js')
vi.mock('#common/helpers/s3/s3-client.js')
vi.mock('#adapters/repositories/uploads/cdp-uploader.js')
vi.mock('#repositories/organisations/mongodb.js')
vi.mock('#repositories/summary-logs/mongodb.js')
vi.mock('#repositories/waste-records/mongodb.js')
vi.mock('#repositories/waste-balances/mongodb.js')
vi.mock('#repositories/system-logs/mongodb.js')
vi.mock('./consumer.js')

const { createSqsClient } = await import('#common/helpers/sqs/sqs-client.js')
const { createS3Client } = await import('#common/helpers/s3/s3-client.js')
const { createUploadsRepository } =
  await import('#adapters/repositories/uploads/cdp-uploader.js')
const { createOrganisationsRepository } =
  await import('#repositories/organisations/mongodb.js')
const { createSummaryLogsRepository } =
  await import('#repositories/summary-logs/mongodb.js')
const { createWasteRecordsRepository } =
  await import('#repositories/waste-records/mongodb.js')
const { createWasteBalancesRepository } =
  await import('#repositories/waste-balances/mongodb.js')
const { createSystemLogsRepository } =
  await import('#repositories/system-logs/mongodb.js')
const { createCommandQueueConsumer } = await import('./consumer.js')

describe('commandQueueConsumerPlugin', () => {
  let server
  let config
  let mockSqsClient
  let mockS3Client
  let mockConsumer
  let mockUploadsRepository
  let mockSummaryLogsRepositoryFactory
  let mockOrganisationsRepositoryFactory
  let mockWasteRecordsRepositoryFactory
  let mockWasteBalancesRepositoryFactory
  let mockSystemLogsRepositoryFactory

  beforeEach(() => {
    server = {
      logger: {
        info: vi.fn(),
        error: vi.fn()
      },
      events: {
        on: vi.fn()
      },
      db: {}, // Mock db instead of repos on app
      app: {
        featureFlags: {}
      }
    }

    config = {
      get: vi.fn((key) => {
        const values = {
          awsRegion: 'eu-west-2',
          s3Endpoint: 'http://localhost:4566',
          isDevelopment: true,
          'commandQueue.endpoint': 'http://localhost:4566',
          'commandQueue.queueName': 'test-queue',
          'cdpUploader.url': 'http://localhost:7337',
          'cdpUploader.s3Bucket': 'test-bucket'
        }
        return values[key]
      })
    }

    mockSqsClient = { destroy: vi.fn() }
    mockS3Client = { destroy: vi.fn() }
    mockConsumer = { start: vi.fn(), stop: vi.fn() }
    mockUploadsRepository = {}

    // Mock repository factories
    mockSummaryLogsRepositoryFactory = vi.fn()
    mockOrganisationsRepositoryFactory = vi.fn().mockReturnValue({})
    mockWasteRecordsRepositoryFactory = vi.fn()
    mockWasteBalancesRepositoryFactory = vi.fn()
    mockSystemLogsRepositoryFactory = vi.fn().mockReturnValue({})

    vi.mocked(createSqsClient).mockReturnValue(mockSqsClient)
    vi.mocked(createS3Client).mockReturnValue(mockS3Client)
    vi.mocked(createUploadsRepository).mockReturnValue(mockUploadsRepository)
    vi.mocked(createSummaryLogsRepository).mockResolvedValue(
      mockSummaryLogsRepositoryFactory
    )
    vi.mocked(createOrganisationsRepository).mockResolvedValue(
      mockOrganisationsRepositoryFactory
    )
    vi.mocked(createWasteRecordsRepository).mockResolvedValue(
      mockWasteRecordsRepositoryFactory
    )
    vi.mocked(createWasteBalancesRepository).mockResolvedValue(
      mockWasteBalancesRepositoryFactory
    )
    vi.mocked(createSystemLogsRepository).mockResolvedValue(
      mockSystemLogsRepositoryFactory
    )
    vi.mocked(createCommandQueueConsumer).mockResolvedValue(mockConsumer)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('has correct plugin metadata', () => {
    expect(commandQueueConsumerPlugin.name).toBe('command-queue-consumer')
    expect(commandQueueConsumerPlugin.version).toBe('1.0.0')
    expect(commandQueueConsumerPlugin.dependencies).toContain('mongodb')
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
        s3Bucket: 'test-bucket'
      })
    })

    it('creates repository factories from db', async () => {
      await commandQueueConsumerPlugin.register(server, { config })

      expect(createSummaryLogsRepository).toHaveBeenCalledWith(server.db)
      expect(createOrganisationsRepository).toHaveBeenCalledWith(server.db)
      expect(createWasteRecordsRepository).toHaveBeenCalledWith(server.db)
      expect(createSystemLogsRepository).toHaveBeenCalledWith(server.db)
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
        uploadsRepository: mockUploadsRepository,
        summaryLogsRepositoryFactory: mockSummaryLogsRepositoryFactory,
        organisationsRepositoryFactory: mockOrganisationsRepositoryFactory,
        wasteRecordsRepositoryFactory: mockWasteRecordsRepositoryFactory,
        wasteBalancesRepositoryFactory: mockWasteBalancesRepositoryFactory,
        featureFlags: server.app.featureFlags
      })
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
      expect(mockS3Client.destroy).toHaveBeenCalled()
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
      expect(mockS3Client.destroy).toHaveBeenCalled()
    })
  })
})
