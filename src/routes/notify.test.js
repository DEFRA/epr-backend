import { sendEmail } from '../common/helpers/notify.js'

vi.mock('../common/helpers/notify.js')

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

vi.mock('./common/helpers/mongodb.js')

let server

describe('/send-email route', () => {
  beforeAll(async () => {
    // Dynamic import needed due to config being updated by vitest-mongodb
    const { createServer } = await import('../server.js')

    server = await createServer()
    await server.initialize()
  })

  it('returns 200 on successful email send', async () => {
    sendEmail.mockResolvedValue()

    const response = await server.inject({
      method: 'POST',
      url: '/send-email',
      payload: {
        email: 'test@example.com',
        template: 'registration',
        personalisation: { name: 'Test' }
      }
    })

    expect(sendEmail).toHaveBeenCalledWith('registration', 'test@example.com', {
      name: 'Test'
    })
    expect(response.statusCode).toEqual(200)
    expect(JSON.parse(response.payload)).toEqual({ success: true })
  })

  it('returns 500 if sendEmail throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}) // silence it

    sendEmail.mockRejectedValue(new Error('Notify API failed'))

    const response = await server.inject({
      method: 'POST',
      url: '/send-email',
      payload: {
        email: 'fail@example.com',
        template: 'registration',
        personalisation: { name: 'Fail' }
      }
    })

    expect(response.statusCode).toEqual(500)
    expect(JSON.parse(response.payload)).toEqual({
      message: 'An internal server error occurred',
      statusCode: 500,
      error: 'Internal Server Error'
    })

    errorSpy.mockRestore()
  })

  it('returns 400 if payload is invalid', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/send-email',
      payload: {
        email: 'bad@example.com',
        template: 'registration',
        personalisation: undefined
      }
    })

    expect(response.statusCode).toEqual(400)
    expect(JSON.parse(response.payload).message).toMatch(/Invalid payload/)
  })
})
