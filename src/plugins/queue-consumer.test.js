import { describe, it, expect, vi, beforeEach } from 'vitest'
import Hapi from '@hapi/hapi'
import { queueConsumer } from './queue-consumer.js'

import { createSQSClient } from '#common/helpers/sqs/sqs-client.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { createCommandQueueConsumer } from '#workers/queue-consumer/consumer.js'
import { createCommandHandlers } from '#workers/queue-consumer/handlers.js'
import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createWasteRecordsRepository } from '#repositories/waste-records/mongodb.js'
import { createWasteBalancesRepository } from '#repositories/waste-balances/mongodb.js'
import { createUploadsRepository } from '#adapters/repositories/uploads/cdp-uploader.js'
import { createSummaryLogExtractor } from '#application/summary-logs/extractor.js'
import { createConfigFeatureFlags } from '#feature-flags/feature-flags.config.js'

// Mock dependencies
vi.mock('#common/helpers/sqs/sqs-client.js', () => ({
  createSQSClient: vi.fn()
}))

vi.mock('#common/helpers/s3/s3-client.js', () => ({
  createS3Client: vi.fn()
}))

vi.mock('#workers/queue-consumer/consumer.js', () => ({
  createCommandQueueConsumer: vi.fn()
}))

vi.mock('#workers/queue-consumer/handlers.js', () => ({
  createCommandHandlers: vi.fn()
}))

vi.mock('#repositories/summary-logs/mongodb.js', () => ({
  createSummaryLogsRepository: vi.fn()
}))

vi.mock('#repositories/organisations/mongodb.js', () => ({
  createOrganisationsRepository: vi.fn()
}))

vi.mock('#repositories/waste-records/mongodb.js', () => ({
  createWasteRecordsRepository: vi.fn()
}))

vi.mock('#repositories/waste-balances/mongodb.js', () => ({
  createWasteBalancesRepository: vi.fn()
}))

vi.mock('#adapters/repositories/uploads/cdp-uploader.js', () => ({
  createUploadsRepository: vi.fn()
}))

vi.mock('#application/summary-logs/extractor.js', () => ({
  createSummaryLogExtractor: vi.fn()
}))

vi.mock('#feature-flags/feature-flags.config.js', () => ({
  createConfigFeatureFlags: vi.fn()
}))

/**
 * Helper to create a minimal mongodb plugin for testing
 */
const createMongoDbPlugin = (db) => ({
  plugin: {
    name: 'mongodb',
    version: '1.0.0',
    register: (server) => {
      server.decorate('server', 'db', db)
    }
  }
})

describe('queue-consumer plugin', () => {
  let server
  let mockConfig
  let mockSqsClient
  let mockS3Client
  let mockConsumer
  let mockLogger
  let mockDb

  beforeEach(async () => {
    vi.clearAllMocks()

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }

    mockDb = { collection: vi.fn() }

    server = Hapi.server()
    server.decorate('server', 'logger', mockLogger)

    mockConfig = {
      get: vi.fn((key) => {
        const values = {
          'commandQueue.name': 'test-queue',
          'commandQueue.endpoint': 'http://localhost:4566',
          awsRegion: 'eu-west-2',
          s3Endpoint: 'http://localhost:4566',
          isDevelopment: true,
          'cdpUploader.url': 'http://localhost:7337',
          'cdpUploader.s3Bucket': 'test-bucket'
        }
        return values[key]
      })
    }

    mockSqsClient = { destroy: vi.fn() }
    mockS3Client = { destroy: vi.fn() }
    createSQSClient.mockReturnValue(mockSqsClient)
    createS3Client.mockReturnValue(mockS3Client)

    mockConsumer = {
      start: vi.fn(),
      stop: vi.fn()
    }
    createCommandQueueConsumer.mockResolvedValue(mockConsumer)

    createCommandHandlers.mockReturnValue({
      handleValidateCommand: vi.fn(),
      handleSubmitCommand: vi.fn()
    })

    // Mock repository factories
    createSummaryLogsRepository.mockResolvedValue(() => ({}))
    createOrganisationsRepository.mockResolvedValue(() => ({}))
    createWasteRecordsRepository.mockResolvedValue(() => ({}))
    createWasteBalancesRepository.mockResolvedValue(() => ({}))
    createUploadsRepository.mockReturnValue({})
    createSummaryLogExtractor.mockReturnValue({})
    createConfigFeatureFlags.mockReturnValue({})
  })

  it('has correct plugin metadata', () => {
    expect(queueConsumer.plugin.name).toBe('queue-consumer')
    expect(queueConsumer.plugin.version).toBe('1.0.0')
  })

  it('skips registration when skip option is true', async () => {
    await server.register(createMongoDbPlugin(mockDb))
    await server.register({
      plugin: queueConsumer,
      options: { config: mockConfig, skip: true }
    })

    await server.initialize()

    expect(createSQSClient).not.toHaveBeenCalled()
    expect(createCommandQueueConsumer).not.toHaveBeenCalled()
  })

  it('skips when mongodb plugin is not registered', async () => {
    await server.register({
      plugin: queueConsumer,
      options: { config: mockConfig }
    })

    await server.initialize()

    expect(mockLogger.warn).toHaveBeenCalledWith(
      'MongoDB plugin not registered, queue consumer will not start'
    )
    expect(createSQSClient).not.toHaveBeenCalled()
  })

  describe('with mongodb', () => {
    beforeEach(async () => {
      await server.register(createMongoDbPlugin(mockDb))
    })

    it('creates SQS client with correct config', async () => {
      await server.register({
        plugin: queueConsumer,
        options: { config: mockConfig }
      })

      await server.initialize()

      expect(createSQSClient).toHaveBeenCalledWith({
        region: 'eu-west-2',
        endpoint: 'http://localhost:4566'
      })
    })

    it('creates S3 client for uploads repository', async () => {
      await server.register({
        plugin: queueConsumer,
        options: { config: mockConfig }
      })

      await server.initialize()

      expect(createS3Client).toHaveBeenCalledWith({
        region: 'eu-west-2',
        endpoint: 'http://localhost:4566',
        forcePathStyle: true
      })
    })

    it('creates repositories using server.db', async () => {
      await server.register({
        plugin: queueConsumer,
        options: { config: mockConfig }
      })

      await server.initialize()

      expect(createSummaryLogsRepository).toHaveBeenCalledWith(mockDb)
      expect(createOrganisationsRepository).toHaveBeenCalledWith(mockDb)
      expect(createWasteRecordsRepository).toHaveBeenCalledWith(mockDb)
      expect(createWasteBalancesRepository).toHaveBeenCalledWith(
        mockDb,
        expect.objectContaining({ organisationsRepository: expect.anything() })
      )
    })

    it('creates command handlers with logger and repositories', async () => {
      await server.register({
        plugin: queueConsumer,
        options: { config: mockConfig }
      })

      await server.initialize()

      expect(createCommandHandlers).toHaveBeenCalledWith({
        logger: server.logger,
        repositories: expect.objectContaining({
          summaryLogsRepository: expect.anything(),
          organisationsRepository: expect.anything(),
          wasteRecordsRepository: expect.anything(),
          wasteBalancesRepository: expect.anything(),
          summaryLogExtractor: expect.anything(),
          featureFlags: expect.anything()
        })
      })
    })

    it('creates consumer with correct dependencies', async () => {
      const mockHandlers = {
        handleValidateCommand: vi.fn(),
        handleSubmitCommand: vi.fn()
      }
      createCommandHandlers.mockReturnValue(mockHandlers)

      await server.register({
        plugin: queueConsumer,
        options: { config: mockConfig }
      })

      await server.initialize()

      expect(createCommandQueueConsumer).toHaveBeenCalledWith({
        sqsClient: mockSqsClient,
        queueName: 'test-queue',
        logger: server.logger,
        handleValidateCommand: mockHandlers.handleValidateCommand,
        handleSubmitCommand: mockHandlers.handleSubmitCommand
      })
    })

    it('starts consumer on server start', async () => {
      await server.register({
        plugin: queueConsumer,
        options: { config: mockConfig }
      })

      await server.initialize()
      await server.start()

      expect(mockConsumer.start).toHaveBeenCalled()

      await server.stop()
    })

    it('stops consumer and destroys clients on server stop', async () => {
      await server.register({
        plugin: queueConsumer,
        options: { config: mockConfig }
      })

      await server.initialize()
      await server.start()
      await server.stop()

      expect(mockConsumer.stop).toHaveBeenCalled()
      expect(mockSqsClient.destroy).toHaveBeenCalled()
      expect(mockS3Client.destroy).toHaveBeenCalled()
    })

    it('cleans up clients and throws when consumer creation fails', async () => {
      const error = new Error('Queue not found')
      createCommandQueueConsumer.mockRejectedValue(error)

      await server.register({
        plugin: queueConsumer,
        options: { config: mockConfig }
      })

      await expect(server.initialize()).rejects.toThrow('Queue not found')

      expect(mockSqsClient.destroy).toHaveBeenCalled()
      expect(mockS3Client.destroy).toHaveBeenCalled()
    })
  })
})
