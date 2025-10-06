import {
  AUDIT_EVENT_ACTIONS,
  AUDIT_EVENT_CATEGORIES,
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import { FORM_FIELDS_SHORT_DESCRIPTIONS } from '#common/enums/index.js'
import registrationFixture from '#data/fixtures/registration.json'
import { registrationPath } from './registration.js'

const mockLoggerInfo = vi.fn()
const mockLoggerError = vi.fn()
const mockLoggerWarn = vi.fn()
const mockAudit = vi.fn()

const mockInsertOne = vi.fn()

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: (...args) => mockLoggerInfo(...args),
    error: (...args) => mockLoggerError(...args),
    warn: (...args) => mockLoggerWarn(...args)
  }
}))

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockAudit(...args)
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

    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: AUDIT_EVENT_CATEGORIES.DB,
        action: AUDIT_EVENT_ACTIONS.DB_INSERT
      },
      context: {
        orgId: expect.any(Number),
        referenceNumber: expect.any(String)
      }
    })

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

  it('returns 422 if payload is missing orgId', async () => {
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

    expect(response.statusCode).toEqual(422)
    expect(body.message).toEqual(message)
  })

  it('returns 422 if payload is missing reference number', async () => {
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

    expect(response.statusCode).toEqual(422)
    expect(body.message).toEqual(message)
  })

  it('returns 422 if orgId is below minimum value', async () => {
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
                    name: 'orgIdField',
                    shortDescription: FORM_FIELDS_SHORT_DESCRIPTIONS.ORG_ID,
                    title: 'What is your Organisation ID number?',
                    type: 'TextField'
                  },
                  {
                    name: 'refField',
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
            orgIdField: '499999',
            refField: 'abcdef123456fedcba654321'
          }
        }
      }
    })

    const message = 'Organisation ID must be at least 500000'
    const body = JSON.parse(response.payload)

    expect(response.statusCode).toEqual(422)
    expect(body.message).toEqual(message)
    expect(mockLoggerWarn).toHaveBeenCalledWith({
      message:
        'orgId: 499999, referenceNumber: abcdef123456fedcba654321 - Organisation ID must be at least 500000',
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
      },
      http: {
        response: {
          status_code: 422
        }
      }
    })
  })

  it('returns 500 if error is thrown by insertOne', async () => {
    const statusCode = 500
    const error = new Error('db.collection.insertOne failed')
    mockInsertOne.mockImplementationOnce(() => {
      throw error
    })

    const response = await server.inject({
      method: 'POST',
      url,
      payload: registrationFixture
    })

    expect(response.statusCode).toEqual(statusCode)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(`An internal server error occurred`)
    expect(mockLoggerError).toHaveBeenCalledWith(error, {
      message: `Failure on ${registrationPath} for orgId: 500000 and referenceNumber: 68a66ec3dabf09f3e442b2da, mongo validation failures: `,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
      },
      http: {
        response: {
          status_code: statusCode
        }
      }
    })
  })

  it('returns 500 if insertOne fails with mongo validation failures', async () => {
    const statusCode = 500
    const error = Object.assign(new Error('db.collection.insertOne failed'), {
      errInfo: JSON.parse(
        '{"failingDocumentId":"68da86a39a36abfab162b707","details":{"operatorName":"$jsonSchema","title":"Registration Validation","schemaRulesNotSatisfied":[{"operatorName":"properties","propertiesNotSatisfied":[{"propertyName":"orgId","description":"\'orgId\' must be a positive integer above 500000 and is required","details":[{"operatorName":"minimum","specifiedAs":{"minimum":500000},"reason":"comparison failed","consideredValue":100000}]}]}]}}'
      )
    })
    mockInsertOne.mockImplementationOnce(() => {
      throw error
    })

    const response = await server.inject({
      method: 'POST',
      url,
      payload: registrationFixture
    })

    expect(response.statusCode).toEqual(statusCode)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(`An internal server error occurred`)
    expect(mockLoggerError).toHaveBeenCalledWith(error, {
      message: `Failure on /v1/apply/registration for orgId: 500000 and referenceNumber: 68a66ec3dabf09f3e442b2da, mongo validation failures: orgId - 'orgId' must be a positive integer above 500000 and is required`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
      },
      http: {
        response: {
          status_code: statusCode
        }
      }
    })
  })
})
