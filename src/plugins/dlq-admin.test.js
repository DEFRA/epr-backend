import Hapi from '@hapi/hapi'

import { dlqAdminPlugin } from './dlq-admin.js'

vi.mock('#common/helpers/sqs/sqs-client.js')

const {
  createSqsClient,
  resolveDlqUrl,
  getApproximateMessageCount,
  purgeQueue
} = await import('#common/helpers/sqs/sqs-client.js')

describe('dlqAdminPlugin', () => {
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

    mockSqsClient = { destroy: vi.fn() }

    vi.mocked(createSqsClient).mockReturnValue(mockSqsClient)
    vi.mocked(resolveDlqUrl).mockResolvedValue(
      'http://localhost:4566/000000000000/test-queue-dlq'
    )
  })

  afterEach(async () => {
    await server.stop()
    vi.resetAllMocks()
  })

  it('has correct plugin name and version', () => {
    expect(dlqAdminPlugin.name).toBe('dlq-admin')
    expect(dlqAdminPlugin.version).toBe('1.0.0')
  })

  it('registers without error', async () => {
    await server.register({ plugin: dlqAdminPlugin, options: { config } })

    expect(server.registrations['dlq-admin']).toBeDefined()
  })

  it('creates SQS client with correct config', async () => {
    await server.register({ plugin: dlqAdminPlugin, options: { config } })

    expect(createSqsClient).toHaveBeenCalledWith({
      region: 'eu-west-2',
      endpoint: 'http://localhost:4566'
    })
  })

  it('resolves DLQ URL from main queue name', async () => {
    await server.register({ plugin: dlqAdminPlugin, options: { config } })

    expect(resolveDlqUrl).toHaveBeenCalledWith(mockSqsClient, 'test-queue')
  })

  it('decorates request with dlqService', async () => {
    vi.mocked(getApproximateMessageCount).mockResolvedValue(5)
    vi.mocked(purgeQueue).mockResolvedValue(undefined)

    await server.register({ plugin: dlqAdminPlugin, options: { config } })

    server.route({
      method: 'GET',
      path: '/test-status',
      handler: async (request) => request.dlqService.getStatus()
    })

    server.route({
      method: 'POST',
      path: '/test-purge',
      handler: async (request) => {
        await request.dlqService.purge()
        return { purged: true }
      }
    })

    const statusResponse = await server.inject({
      method: 'GET',
      url: '/test-status'
    })
    expect(statusResponse.statusCode).toBe(200)
    expect(statusResponse.result).toEqual({ approximateMessageCount: 5 })

    const purgeResponse = await server.inject({
      method: 'POST',
      url: '/test-purge'
    })
    expect(purgeResponse.statusCode).toBe(200)
    expect(purgeResponse.result).toEqual({ purged: true })
  })

  it('destroys SQS client on server stop', async () => {
    await server.register({ plugin: dlqAdminPlugin, options: { config } })
    await server.start()
    await server.stop()

    expect(mockSqsClient.destroy).toHaveBeenCalled()
  })
})
