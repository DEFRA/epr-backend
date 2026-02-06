import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { commandQueueConsumerPlugin } from './queue-consumer.plugin.js'

vi.mock('#common/helpers/sqs/sqs-client.js')
vi.mock('#common/helpers/s3/s3-client.js')
vi.mock('#application/summary-logs/extractor.js')
vi.mock('./consumer.js')
vi.mock('#repositories/summary-logs/mongodb.js')
vi.mock('#repositories/organisations/mongodb.js')
vi.mock('#repositories/waste-records/mongodb.js')
vi.mock('#repositories/waste-balances/mongodb.js')
vi.mock('#adapters/repositories/uploads/cdp-uploader.js')

const { createSqsClient } = await import('#common/helpers/sqs/sqs-client.js')
const { createS3Client } = await import('#common/helpers/s3/s3-client.js')
const { createSummaryLogExtractor } =
  await import('#application/summary-logs/extractor.js')
const { createCommandQueueConsumer } = await import('./consumer.js')
const { createSummaryLogsRepository } =
  await import('#repositories/summary-logs/mongodb.js')
const { createOrganisationsRepository } =
  await import('#repositories/organisations/mongodb.js')
const { createWasteRecordsRepository } =
  await import('#repositories/waste-records/mongodb.js')
const { createWasteBalancesRepository } =
  await import('#repositories/waste-balances/mongodb.js')
const { createUploadsRepository } =
  await import('#adapters/repositories/uploads/cdp-uploader.js')

describe('commandQueueConsumerPlugin', () => {
  let server
  let config
  let mockSqsClient
  let mockS3Client
  let mockConsumer
  let mockSummaryLogsRepository
  let mockOrganisationsRepository
  let mockWasteRecordsRepository
  let mockWasteBalancesRepository
  let mockUploadsRepository

  beforeEach(() => {
    server = {
      db: {},
      logger: {
        info: vi.fn(),
        error: vi.fn()
      },
      events: {
        on: vi.fn()
      }
    }

    config = {
      get: vi.fn((key) => {
        const values = {
          awsRegion: 'eu-west-2',
          s3Endpoint: 'http://localhost:4566',
          isDevelopment: true,
          'cdpUploader.url': 'http://cdp-uploader',
          'cdpUploader.s3Bucket': 'test-bucket',
          'commandQueue.endpoint': 'http://localhost:4566',
          'commandQueue.queueName': 'test-queue'
        }
        return values[key]
      })
    }

    mockSqsClient = { destroy: vi.fn() }
    mockS3Client = {}
    mockConsumer = { start: vi.fn(), stop: vi.fn() }
    mockSummaryLogsRepository = { findById: vi.fn() }
    mockOrganisationsRepository = { findById: vi.fn() }
    mockWasteRecordsRepository = { findByRegistration: vi.fn() }
    mockWasteBalancesRepository = { findByRegistration: vi.fn() }
    mockUploadsRepository = { findByLocation: vi.fn() }

    vi.mocked(createSqsClient).mockReturnValue(mockSqsClient)
    vi.mocked(createS3Client).mockReturnValue(mockS3Client)
    vi.mocked(createSummaryLogExtractor).mockReturnValue({})
    vi.mocked(createCommandQueueConsumer).mockResolvedValue(mockConsumer)
    vi.mocked(createUploadsRepository).mockReturnValue(mockUploadsRepository)
    vi.mocked(createSummaryLogsRepository).mockResolvedValue(
      mockSummaryLogsRepository
    )
    vi.mocked(createOrganisationsRepository).mockResolvedValue(
      () => mockOrganisationsRepository
    )
    vi.mocked(createWasteRecordsRepository).mockResolvedValue(
      () => mockWasteRecordsRepository
    )
    vi.mocked(createWasteBalancesRepository).mockResolvedValue(
      () => mockWasteBalancesRepository
    )
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('has correct plugin metadata', () => {
    expect(commandQueueConsumerPlugin.name).toBe('command-queue-consumer')
    expect(commandQueueConsumerPlugin.version).toBe('1.0.0')
    expect(commandQueueConsumerPlugin.dependencies).toContain('mongodb')
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

    it('creates uploads repository with S3 client and config', async () => {
      await commandQueueConsumerPlugin.register(server, { config })

      expect(createUploadsRepository).toHaveBeenCalledWith({
        s3Client: mockS3Client,
        cdpUploaderUrl: 'http://cdp-uploader',
        s3Bucket: 'test-bucket'
      })
    })

    it('creates summary logs repository with db and logger', async () => {
      await commandQueueConsumerPlugin.register(server, { config })

      expect(createSummaryLogsRepository).toHaveBeenCalledWith(
        server.db,
        server.logger
      )
    })

    it('creates organisations repository with db', async () => {
      await commandQueueConsumerPlugin.register(server, { config })

      expect(createOrganisationsRepository).toHaveBeenCalledWith(server.db)
    })

    it('creates waste records repository with db', async () => {
      await commandQueueConsumerPlugin.register(server, { config })

      expect(createWasteRecordsRepository).toHaveBeenCalledWith(server.db)
    })

    it('creates waste balances repository with db and organisations repository', async () => {
      await commandQueueConsumerPlugin.register(server, { config })

      expect(createWasteBalancesRepository).toHaveBeenCalledWith(server.db, {
        organisationsRepository: mockOrganisationsRepository
      })
    })

    it('creates summary log extractor', async () => {
      await commandQueueConsumerPlugin.register(server, { config })

      expect(createSummaryLogExtractor).toHaveBeenCalledWith({
        uploadsRepository: mockUploadsRepository,
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
        summaryLogsRepository: mockSummaryLogsRepository,
        organisationsRepository: mockOrganisationsRepository,
        wasteRecordsRepository: mockWasteRecordsRepository,
        wasteBalancesRepository: mockWasteBalancesRepository,
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
