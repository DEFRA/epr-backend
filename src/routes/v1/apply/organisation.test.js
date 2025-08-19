import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../../../common/enums/event.js'

const mockLoggerInfo = vi.fn()
const mockLoggerError = vi.fn()
const mockLoggerWarn = vi.fn()

vi.mock('../../../common/helpers/logging/logger.js', () => ({
  createLogger: () => ({
    info: (...args) => mockLoggerInfo(...args),
    error: (...args) => mockLoggerError(...args),
    warn: (...args) => mockLoggerWarn(...args)
  })
}))

let server

describe('/v1/apply/organisation route', () => {
  beforeAll(async () => {
    const { createServer } = await import('../../../server.js')
    server = await createServer()
    await server.initialize()
  })

  it('returns 200 and echoes back payload on valid request', async () => {
    const payload = {
      orgName: 'GreenTech Solutions Ltd',
      orgType: 'Private Limited Company',
      companyNumber: '12345678',
      address: {
        line1: '123 High Street',
        line2: 'Innovation Park',
        city: 'Manchester',
        postcode: 'M1 2AB'
      },
      contact: {
        name: 'Jane Doe',
        email: 'jane.doe@greentech.co.uk',
        phone: '+44 161 123 4567'
      }
    }

    const response = await server.inject({
      method: 'POST',
      url: '/v1/apply/organisation',
      payload
    })

    expect(response.statusCode).toEqual(200)

    const body = JSON.parse(response.payload)
    expect(body.success).toBe(true)
    expect(mockLoggerInfo).toHaveBeenCalledWith({
      message: expect.any(String),
      payload,
      event: {
        category: LOGGING_EVENT_CATEGORIES.API,
        action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
      }
    })
  })

  it('returns 400 if payload is not an object', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/apply/organisation',
      payload: 'not-an-object'
    })

    expect(response.statusCode).toEqual(400)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(/Invalid request payload JSON format/)
  })

  it('returns 400 if payload is null', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/apply/organisation',
      payload: null
    })

    expect(response.statusCode).toEqual(400)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(/Invalid payload/)
  })
})
