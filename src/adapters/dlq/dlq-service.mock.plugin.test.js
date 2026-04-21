import Hapi from '@hapi/hapi'

import {
  mockDlqServicePlugin,
  dlqServicePlugin
} from './dlq-service.mock.plugin.js'

describe('mockDlqServicePlugin', () => {
  let server

  beforeEach(async () => {
    server = Hapi.server()
  })

  afterEach(async () => {
    await server.stop()
    vi.resetAllMocks()
  })

  it('has correct plugin name', () => {
    expect(mockDlqServicePlugin.name).toBe('dlq-service')
  })

  it('is also exported as dlqServicePlugin', () => {
    expect(dlqServicePlugin).toBe(mockDlqServicePlugin)
  })

  it('decorates request with no-op dlqService by default', async () => {
    await server.register(mockDlqServicePlugin)

    server.route({
      method: 'GET',
      path: '/test',
      handler: async (request) => {
        const status = await request.dlqService.getStatus()
        await request.dlqService.purge()
        return status
      }
    })

    const response = await server.inject({ method: 'GET', url: '/test' })

    expect(response.statusCode).toBe(200)
    expect(response.result).toEqual({ approximateMessageCount: 0 })
  })

  it('uses the provided dlqService override', async () => {
    const mockService = {
      getStatus: vi.fn().mockResolvedValue({ approximateMessageCount: 5 }),
      purge: vi.fn().mockResolvedValue(undefined)
    }

    await server.register({
      plugin: mockDlqServicePlugin,
      options: { dlqService: mockService }
    })

    server.route({
      method: 'GET',
      path: '/test',
      handler: async (request) => request.dlqService.getStatus()
    })

    const response = await server.inject({ method: 'GET', url: '/test' })

    expect(response.statusCode).toBe(200)
    expect(response.result).toEqual({ approximateMessageCount: 5 })
    expect(mockService.getStatus).toHaveBeenCalled()
  })
})
