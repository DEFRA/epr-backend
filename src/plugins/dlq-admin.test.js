import Hapi from '@hapi/hapi'

import { dlqAdminPlugin } from './dlq-admin.js'

vi.mock('#common/helpers/sqs/sqs-client.js')

const {
  createSqsClient,
  resolveDlqUrl,
  getApproximateMessageCount,
  receiveMessages,
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

  it('decorates request with dlqService exposing getMessages and purge', async () => {
    vi.mocked(getApproximateMessageCount).mockResolvedValue(2)
    vi.mocked(receiveMessages).mockResolvedValue([
      {
        messageId: 'msg-1',
        sentTimestamp: '2026-04-21T10:30:00.000Z',
        approximateReceiveCount: 3,
        body: '{"type":"TEST"}'
      }
    ])
    vi.mocked(purgeQueue).mockResolvedValue(undefined)

    await server.register({ plugin: dlqAdminPlugin, options: { config } })

    server.route({
      method: 'GET',
      path: '/test-messages',
      handler: async (request) => request.dlqService.getMessages()
    })

    server.route({
      method: 'POST',
      path: '/test-purge',
      handler: async (request) => {
        await request.dlqService.purge()
        return { purged: true }
      }
    })

    const messagesResponse = await server.inject({
      method: 'GET',
      url: '/test-messages'
    })
    expect(messagesResponse.statusCode).toBe(200)
    expect(messagesResponse.result).toEqual({
      approximateMessageCount: 2,
      messages: [
        {
          messageId: 'msg-1',
          sentTimestamp: '2026-04-21T10:30:00.000Z',
          approximateReceiveCount: 3,
          body: '{"type":"TEST"}',
          command: { type: 'TEST' }
        }
      ]
    })

    const purgeResponse = await server.inject({
      method: 'POST',
      url: '/test-purge'
    })
    expect(purgeResponse.statusCode).toBe(200)
    expect(purgeResponse.result).toEqual({ purged: true })
  })

  it('sets command to null when body is not valid JSON', async () => {
    vi.mocked(getApproximateMessageCount).mockResolvedValue(1)
    vi.mocked(receiveMessages).mockResolvedValue([
      {
        messageId: 'msg-bad',
        sentTimestamp: '2026-04-21T11:00:00.000Z',
        approximateReceiveCount: 1,
        body: 'not-json'
      }
    ])

    await server.register({ plugin: dlqAdminPlugin, options: { config } })

    server.route({
      method: 'GET',
      path: '/test-messages',
      handler: async (request) => request.dlqService.getMessages()
    })

    const response = await server.inject({
      method: 'GET',
      url: '/test-messages'
    })

    expect(response.result.messages[0].command).toBeNull()
  })

  it('destroys SQS client on server stop', async () => {
    await server.register({ plugin: dlqAdminPlugin, options: { config } })
    await server.start()
    await server.stop()

    expect(mockSqsClient.destroy).toHaveBeenCalled()
  })
})
