import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../../../common/enums/event.js'
import accreditationFixture from '../../../data/fixtures/accreditation.json'
import { accreditationPath } from './accreditation.js'

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

vi.mock('./common/helpers/mongodb.js')

const url = accreditationPath
let server

describe(`${url} route`, () => {
  beforeAll(async () => {
    const { createServer } = await import('../../../server.js')
    server = await createServer()
    await server.initialize()
  })

  it('returns 200 and echoes back payload on valid request', async () => {
    const response = await server.inject({
      method: 'POST',
      url,
      payload: accreditationFixture
    })

    expect(response.statusCode).toEqual(204)
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.any(String),
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
        }
      })
    )
  })

  it('returns 400 if payload is not an object', async () => {
    const response = await server.inject({
      method: 'POST',
      url,
      payload: 'not-an-object'
    })

    expect(response.statusCode).toEqual(400)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(/Invalid request payload JSON format/)
  })

  it('returns 400 if payload is null', async () => {
    const response = await server.inject({
      method: 'POST',
      url,
      payload: null
    })

    expect(response.statusCode).toEqual(400)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(/Invalid payload/)
  })
})
