import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../../../common/enums/event.js'
import { FORM_FIELDS_SHORT_DESCRIPTIONS } from '../../../common/enums/index.js'
import registrationFixture from '../../../data/fixtures/registration.json'
import { registrationPath } from './registration.js'

const mockLoggerInfo = vi.fn()
const mockLoggerError = vi.fn()
const mockLoggerWarn = vi.fn()

const mockInsertOne = vi.fn()

vi.mock('../../../common/helpers/logging/logger.js', () => ({
  createLogger: () => ({
    info: (...args) => mockLoggerInfo(...args),
    error: (...args) => mockLoggerError(...args),
    warn: (...args) => mockLoggerWarn(...args)
  })
}))

const url = registrationPath
let server

describe(`${url} route`, () => {
  beforeAll(async () => {
    const { createServer } = await import('../../../server.js')
    server = await createServer()
    await server.initialize()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    const collectionSpy = vi.spyOn(server.db, 'collection')

    collectionSpy.mockReturnValue({
      insertOne: mockInsertOne
    })
  })

  it('returns 201 and echoes back payload on valid request', async () => {
    const response = await server.inject({
      method: 'POST',
      url,
      payload: registrationFixture
    })

    expect(response.statusCode).toEqual(201)

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

  it('returns 400 if payload is missing orgId', async () => {
    const response = await server.inject({
      method: 'POST',
      url,
      payload: {
        meta: {
          definition: {
            pages: [
              {
                components: [
                  {
                    name: 'asd123',
                    shortDescription:
                      FORM_FIELDS_SHORT_DESCRIPTIONS.REFERENCE_NUMBER,
                    title: 'What is your System Reference number?',
                    type: 'TextField'
                  }
                ]
              }
            ]
          }
        },
        data: {
          main: {
            asd123: '68a66ec3dabf09f3e442b2da'
          }
        }
      }
    })

    const message = 'Could not extract orgId from answers'
    const body = JSON.parse(response.payload)

    expect(response.statusCode).toEqual(400)
    expect(body.message).toEqual(message)
  })

  it('returns 400 if payload is missing reference number', async () => {
    const response = await server.inject({
      method: 'POST',
      url,
      payload: {
        meta: {
          definition: {
            pages: [
              {
                components: [
                  {
                    name: 'asd456',
                    shortDescription: FORM_FIELDS_SHORT_DESCRIPTIONS.ORG_ID,
                    title: 'What is your Organisation ID number?',
                    type: 'TextField'
                  }
                ]
              }
            ]
          }
        },
        data: {
          main: {
            asd456: '500019'
          }
        }
      }
    })

    const message = 'Could not extract referenceNumber from answers'
    const body = JSON.parse(response.payload)

    expect(response.statusCode).toEqual(400)
    expect(body.message).toEqual(message)
  })

  it('returns 500 if error is thrown by insertOne', async () => {
    const error = new Error('db.collection.insertOne failed')
    mockInsertOne.mockImplementationOnce(() => {
      throw error
    })

    const response = await server.inject({
      method: 'POST',
      url,
      payload: registrationFixture
    })

    expect(response.statusCode).toEqual(500)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(`An internal server error occurred`)
    expect(mockLoggerError).toHaveBeenCalledWith(error, {
      message: `Failure on ${registrationPath}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
      }
    })
  })
})
