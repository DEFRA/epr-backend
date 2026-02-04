import Hapi from '@hapi/hapi'

import { sqsCommandExecutorPlugin } from './sqs-command-executor.plugin.js'

vi.mock('#common/helpers/sqs/sqs-client.js')
vi.mock('./sqs-command-executor.js')

const { createSqsClient } = await import('#common/helpers/sqs/sqs-client.js')
const { createSqsCommandExecutor } = await import('./sqs-command-executor.js')

describe('sqsCommandExecutorPlugin', () => {
  let server
  let config
  let mockSqsClient
  let mockExecutor

  beforeEach(async () => {
    server = Hapi.server()

    // Hapi servers need a logger - decorate it
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    }
    server.decorate('server', 'logger', logger)

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

    mockSqsClient = {
      send: vi.fn().mockResolvedValue({
        QueueUrl: 'http://localhost:4566/000000000000/test-queue'
      }),
      destroy: vi.fn()
    }

    mockExecutor = {
      validate: vi.fn(),
      submit: vi.fn()
    }

    vi.mocked(createSqsClient).mockReturnValue(mockSqsClient)
    vi.mocked(createSqsCommandExecutor).mockResolvedValue(mockExecutor)
  })

  afterEach(async () => {
    await server.stop()
    vi.resetAllMocks()
  })

  it('has correct plugin name', () => {
    expect(sqsCommandExecutorPlugin.name).toBe('sqs-command-executor')
  })

  it('has correct plugin version', () => {
    expect(sqsCommandExecutorPlugin.version).toBe('1.0.0')
  })

  it('registers without error', async () => {
    await server.register({
      plugin: sqsCommandExecutorPlugin,
      options: { config }
    })

    expect(server.registrations['sqs-command-executor']).toBeDefined()
  })

  it('creates SQS client with correct config', async () => {
    await server.register({
      plugin: sqsCommandExecutorPlugin,
      options: { config }
    })

    expect(createSqsClient).toHaveBeenCalledWith({
      region: 'eu-west-2',
      endpoint: 'http://localhost:4566'
    })
  })

  it('creates executor with correct dependencies', async () => {
    await server.register({
      plugin: sqsCommandExecutorPlugin,
      options: { config }
    })

    expect(createSqsCommandExecutor).toHaveBeenCalledWith({
      sqsClient: mockSqsClient,
      queueName: 'test-queue',
      logger: server.logger
    })
  })

  it('decorates request with summaryLogsWorker', async () => {
    await server.register({
      plugin: sqsCommandExecutorPlugin,
      options: { config }
    })

    server.route({
      method: 'GET',
      path: '/test',
      handler: (request) => {
        return {
          hasWorker: !!request.summaryLogsWorker,
          hasValidate: typeof request.summaryLogsWorker.validate === 'function',
          hasSubmit: typeof request.summaryLogsWorker.submit === 'function'
        }
      }
    })

    const response = await server.inject({
      method: 'GET',
      url: '/test'
    })

    expect(response.statusCode).toBe(200)
    expect(response.result).toEqual({
      hasWorker: true,
      hasValidate: true,
      hasSubmit: true
    })
  })

  it('destroys SQS client on server stop', async () => {
    await server.register({
      plugin: sqsCommandExecutorPlugin,
      options: { config }
    })
    await server.start()
    await server.stop()

    expect(mockSqsClient.destroy).toHaveBeenCalled()
  })
})
