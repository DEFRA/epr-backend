const mockLoggerInfo = vi.fn()
const mockLoggerError = vi.fn()
const mockLoggerWarn = vi.fn()

vi.mock('../common/helpers/logging/logger.js', () => ({
  createLogger: () => ({
    info: (...args) => mockLoggerInfo(...args),
    error: (...args) => mockLoggerError(...args),
    warn: (...args) => mockLoggerWarn(...args)
  })
}))

let server

describe('/test-endpoint-dxt route', () => {
  beforeAll(async () => {
    const { createServer } = await import('../server.js')
    server = await createServer()
    await server.initialize()
  })

  it('returns 200 and echoes back payload on valid request', async () => {
    const payload = {
      email: 'test@example.com',
      template: 'test-template',
      personalisation: { name: 'Test' }
    }

    const response = await server.inject({
      method: 'POST',
      url: '/test-endpoint-dxt',
      payload
    })

    expect(response.statusCode).toEqual(200)

    const body = JSON.parse(response.payload)
    expect(body.success).toBe(true)
    expect(body.originalPayload).toEqual(payload)
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'Received test-endpoint-dxt payload:',
      payload
    )
  })

  it('returns 400 if payload is not an object', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/test-endpoint-dxt',
      payload: 'not-an-object'
    })

    expect(response.statusCode).toEqual(400)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(/Invalid request payload JSON format/)
  })

  it('returns 400 if payload is null', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/test-endpoint-dxt',
      payload: null
    })

    expect(response.statusCode).toEqual(400)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(/Invalid payload/)
  })
})
