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

describe('/accreditation route', () => {
  beforeAll(async () => {
    const { createServer } = await import('../../../server.js')
    server = await createServer()
    await server.initialize()
  })

  it('returns 200 and echoes back payload on valid request', async () => {
    const payload = {
      orgId: 'ORG12345',
      accreditationType: 'Approved Exporter',
      site: {
        name: 'GreenTech Recycling Plant',
        address: {
          line1: '45 Industrial Road',
          city: 'Leeds',
          postcode: 'LS1 4AB'
        }
      },
      contact: {
        name: 'Sarah Lee',
        email: 'sarah.lee@greentech.co.uk'
      }
    }

    const response = await server.inject({
      method: 'POST',
      url: '/v1/apply/accreditation',
      payload
    })

    expect(response.statusCode).toEqual(200)

    const body = JSON.parse(response.payload)
    expect(body.success).toBe(true)
    expect(mockLoggerInfo).toHaveBeenCalledWith({
      message: expect.any(String),
      event: {
        category: LOGGING_EVENT_CATEGORIES.API,
        action: LOGGING_EVENT_ACTIONS.REQUEST_RECEIVED
      }
    })
  })

  it('returns 400 if payload is not an object', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/apply/accreditation',
      payload: 'not-an-object'
    })

    expect(response.statusCode).toEqual(400)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(/Invalid request payload JSON format/)
  })

  it('returns 400 if payload is null', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/apply/accreditation',
      payload: null
    })

    expect(response.statusCode).toEqual(400)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(/Invalid payload/)
  })
})
