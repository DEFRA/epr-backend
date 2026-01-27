import { describe, it, expect, vi, beforeEach } from 'vitest'
import Hapi from '@hapi/hapi'
import { queueConsumer } from './queue-consumer.js'

import { createSQSClient } from '#common/helpers/sqs/sqs-client.js'
import { createCommandQueueConsumer } from '#workers/queue-consumer/consumer.js'
import { createCommandHandlers } from '#workers/queue-consumer/handlers.js'

// Mock dependencies
vi.mock('#common/helpers/sqs/sqs-client.js', () => ({
  createSQSClient: vi.fn()
}))

vi.mock('#workers/queue-consumer/consumer.js', () => ({
  createCommandQueueConsumer: vi.fn()
}))

vi.mock('#workers/queue-consumer/handlers.js', () => ({
  createCommandHandlers: vi.fn()
}))

describe('queue-consumer plugin', () => {
  let server
  let mockConfig
  let mockSqsClient
  let mockConsumer
  let mockLogger

  beforeEach(async () => {
    vi.clearAllMocks()

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }

    server = Hapi.server()
    server.decorate('server', 'logger', mockLogger)

    mockConfig = {
      get: vi.fn((key) => {
        const values = {
          'commandQueue.name': 'test-queue',
          'commandQueue.endpoint': 'http://localhost:4566',
          awsRegion: 'eu-west-2'
        }
        return values[key]
      })
    }

    mockSqsClient = { destroy: vi.fn() }
    createSQSClient.mockReturnValue(mockSqsClient)

    mockConsumer = {
      start: vi.fn(),
      stop: vi.fn()
    }
    createCommandQueueConsumer.mockResolvedValue(mockConsumer)

    createCommandHandlers.mockResolvedValue({
      handleValidateCommand: vi.fn(),
      handleSubmitCommand: vi.fn(),
      cleanup: vi.fn()
    })
  })

  it('has correct plugin metadata', () => {
    expect(queueConsumer.plugin.name).toBe('queue-consumer')
    expect(queueConsumer.plugin.version).toBe('1.0.0')
  })

  it('skips registration when skip option is true', async () => {
    await server.register({
      plugin: queueConsumer,
      options: { config: mockConfig, skip: true }
    })

    expect(createSQSClient).not.toHaveBeenCalled()
    expect(createCommandQueueConsumer).not.toHaveBeenCalled()
  })

  it('creates SQS client with correct config', async () => {
    await server.register({
      plugin: queueConsumer,
      options: { config: mockConfig }
    })

    expect(createSQSClient).toHaveBeenCalledWith({
      region: 'eu-west-2',
      endpoint: 'http://localhost:4566'
    })
  })

  it('creates command handlers with logger', async () => {
    await server.register({
      plugin: queueConsumer,
      options: { config: mockConfig }
    })

    expect(createCommandHandlers).toHaveBeenCalledWith({
      logger: server.logger
    })
  })

  it('creates consumer with correct dependencies', async () => {
    const mockHandlers = {
      handleValidateCommand: vi.fn(),
      handleSubmitCommand: vi.fn(),
      cleanup: vi.fn()
    }
    createCommandHandlers.mockResolvedValue(mockHandlers)

    await server.register({
      plugin: queueConsumer,
      options: { config: mockConfig }
    })

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

    await server.start()

    expect(mockConsumer.start).toHaveBeenCalled()

    await server.stop()
  })

  it('stops consumer and cleans up on server stop', async () => {
    const mockCleanup = vi.fn()
    createCommandHandlers.mockResolvedValue({
      handleValidateCommand: vi.fn(),
      handleSubmitCommand: vi.fn(),
      cleanup: mockCleanup
    })

    await server.register({
      plugin: queueConsumer,
      options: { config: mockConfig }
    })

    await server.start()
    await server.stop()

    expect(mockConsumer.stop).toHaveBeenCalled()
    expect(mockSqsClient.destroy).toHaveBeenCalled()
    expect(mockCleanup).toHaveBeenCalled()
  })

  it('cleans up and throws when consumer creation fails', async () => {
    const mockCleanup = vi.fn()
    createCommandHandlers.mockResolvedValue({
      handleValidateCommand: vi.fn(),
      handleSubmitCommand: vi.fn(),
      cleanup: mockCleanup
    })

    const error = new Error('Queue not found')
    createCommandQueueConsumer.mockRejectedValue(error)

    await expect(
      server.register({
        plugin: queueConsumer,
        options: { config: mockConfig }
      })
    ).rejects.toThrow('Queue not found')

    expect(mockSqsClient.destroy).toHaveBeenCalled()
    expect(mockCleanup).toHaveBeenCalled()
  })
})
