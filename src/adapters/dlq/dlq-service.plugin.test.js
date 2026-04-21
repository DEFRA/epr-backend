import Hapi from '@hapi/hapi'

import { dlqServicePlugin } from './dlq-service.plugin.js'

vi.mock('#common/helpers/sqs/sqs-client.js')
vi.mock('./dlq-service.js')

const { createSqsClient } = await import('#common/helpers/sqs/sqs-client.js')
const { getDlqUrl } = await import('./dlq-service.js')

const DLQ_URL = 'http://localhost:4566/000000000000/test-dlq'

describe('dlqServicePlugin', () => {
  let server
  let config
  let mockSqsClient

  beforeEach(async () => {
    server = Hapi.server()

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
      send: vi.fn(),
      destroy: vi.fn()
    }

    vi.mocked(createSqsClient).mockReturnValue(mockSqsClient)
    vi.mocked(getDlqUrl).mockResolvedValue(DLQ_URL)
  })

  afterEach(async () => {
    await server.stop()
    vi.resetAllMocks()
  })

  it('has correct plugin name', () => {
    expect(dlqServicePlugin.name).toBe('dlq-service')
  })

  it('has correct plugin version', () => {
    expect(dlqServicePlugin.version).toBe('1.0.0')
  })

  it('registers without error', async () => {
    await server.register({ plugin: dlqServicePlugin, options: { config } })

    expect(server.registrations['dlq-service']).toBeDefined()
  })

  it('creates SQS client with correct config', async () => {
    await server.register({ plugin: dlqServicePlugin, options: { config } })

    expect(createSqsClient).toHaveBeenCalledWith({
      region: 'eu-west-2',
      endpoint: 'http://localhost:4566'
    })
  })

  it('resolves the DLQ URL from the main queue name', async () => {
    await server.register({ plugin: dlqServicePlugin, options: { config } })

    expect(getDlqUrl).toHaveBeenCalledWith(mockSqsClient, 'test-queue')
  })

  it('decorates request with dlqService exposing getStatus and purge', async () => {
    await server.register({ plugin: dlqServicePlugin, options: { config } })

    server.route({
      method: 'GET',
      path: '/test',
      handler: (request) => ({
        hasDlqService: !!request.dlqService,
        hasGetStatus: typeof request.dlqService.getStatus === 'function',
        hasPurge: typeof request.dlqService.purge === 'function'
      })
    })

    const response = await server.inject({ method: 'GET', url: '/test' })

    expect(response.statusCode).toBe(200)
    expect(response.result).toEqual({
      hasDlqService: true,
      hasGetStatus: true,
      hasPurge: true
    })
  })

  it('destroys SQS client on server stop', async () => {
    await server.register({ plugin: dlqServicePlugin, options: { config } })
    await server.start()
    await server.stop()

    expect(mockSqsClient.destroy).toHaveBeenCalled()
  })
})
