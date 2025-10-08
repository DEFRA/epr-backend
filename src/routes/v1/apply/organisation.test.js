import {
  AUDIT_EVENT_ACTIONS,
  AUDIT_EVENT_CATEGORIES,
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import {
  FORM_FIELDS_SHORT_DESCRIPTIONS,
  ORGANISATION_SUBMISSION_REGULATOR_CONFIRMATION_EMAIL_TEMPLATE_ID,
  ORGANISATION_SUBMISSION_USER_CONFIRMATION_EMAIL_TEMPLATE_ID
} from '#common/enums/index.js'
import { organisationPath } from './organisation.js'
import { sendEmail } from '#common/helpers/notify.js'
import organisationFixture from '#data/fixtures/organisation.json'

const mockAudit = vi.fn()
const mockInsertOne = vi.fn().mockResolvedValue({
  insertedId: { toString: () => '12345678901234567890abcd' }
})

const mockCountDocuments = vi.fn(() => 1)

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockAudit(...args)
}))

vi.mock('#common/helpers/notify.js')

const url = organisationPath
let server

describe(`${url} route`, () => {
  beforeAll(async () => {
    const { createServer } = await import('#server/server.js')
    server = await createServer()
    await server.initialize()

    server.loggerMocks = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    }

    server.ext('onRequest', (request, h) => {
      vi.spyOn(request.logger, 'info').mockImplementation(
        server.loggerMocks.info
      )
      vi.spyOn(request.logger, 'error').mockImplementation(
        server.loggerMocks.error
      )
      vi.spyOn(request.logger, 'warn').mockImplementation(
        server.loggerMocks.warn
      )
      return h.continue
    })
  })

  beforeEach(() => {
    server.loggerMocks.info.mockClear()
    server.loggerMocks.error.mockClear()
    server.loggerMocks.warn.mockClear()
    mockAudit.mockClear()
    mockInsertOne.mockClear()
    mockCountDocuments.mockClear()

    const collectionSpy = vi.spyOn(server.db, 'collection')

    collectionSpy.mockReturnValue({
      countDocuments: mockCountDocuments,
      insertOne: mockInsertOne
    })
  })

  it('returns 200 and echoes back payload on valid request', async () => {
    const response = await server.inject({
      method: 'POST',
      url,
      payload: organisationFixture
    })

    const orgId = 500002
    const orgName = 'ACME ltd'

    expect(response.statusCode).toEqual(200)

    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: AUDIT_EVENT_CATEGORIES.DB,
        action: AUDIT_EVENT_ACTIONS.DB_INSERT
      },
      context: {
        orgId,
        orgName,
        referenceNumber: expect.any(String)
      }
    })
    expect(sendEmail).toHaveBeenCalledWith(
      ORGANISATION_SUBMISSION_USER_CONFIRMATION_EMAIL_TEMPLATE_ID,
      'alice@foo.com',
      {
        orgId,
        orgName,
        referenceNumber: expect.any(String)
      }
    )
    expect(sendEmail).toHaveBeenCalledWith(
      ORGANISATION_SUBMISSION_REGULATOR_CONFIRMATION_EMAIL_TEMPLATE_ID,
      'test@ea.gov.uk',
      {
        orgId,
        orgName,
        referenceNumber: expect.any(String)
      }
    )
    expect(server.loggerMocks.info).toHaveBeenCalledWith(
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

  it('returns 422 if payload is missing email', async () => {
    const response = await server.inject({
      method: 'POST',
      url,
      payload: {
        meta: {
          definition: {
            name: organisationFixture.meta.definition.name,
            pages: [
              {
                components: [
                  {
                    name: 'asd456',
                    shortDescription: FORM_FIELDS_SHORT_DESCRIPTIONS.ORG_NAME,
                    title: 'What is the name of your organisation?',
                    type: 'TextField'
                  }
                ]
              }
            ]
          }
        },
        data: {
          main: {
            asd456: 'ACME LTD'
          }
        }
      }
    })

    const message = 'Could not extract email from answers'
    const body = JSON.parse(response.payload)

    expect(response.statusCode).toEqual(422)
    expect(body.message).toEqual(message)
  })

  it('returns 422 if payload is missing orgName', async () => {
    const response = await server.inject({
      method: 'POST',
      url,
      payload: {
        meta: {
          definition: {
            name: organisationFixture.meta.definition.name,
            pages: [
              {
                components: [
                  {
                    name: 'asd123',
                    shortDescription: FORM_FIELDS_SHORT_DESCRIPTIONS.EMAIL,
                    title: 'What is your email address?',
                    type: 'EmailAddressField'
                  }
                ]
              }
            ]
          }
        },
        data: {
          main: {
            asd123: 'a@b.com'
          }
        }
      }
    })

    const message = 'Could not extract organisation name from answers'
    const body = JSON.parse(response.payload)

    expect(response.statusCode).toEqual(422)
    expect(body.message).toEqual(message)
  })

  it('returns 422 if payload is missing regulatorEmail', async () => {
    const response = await server.inject({
      method: 'POST',
      url,
      payload: {
        meta: {
          definition: {
            name: undefined
          }
        },
        data: {
          main: {}
        }
      }
    })

    const message = 'Could not get regulator name from data'
    const body = JSON.parse(response.payload)

    expect(response.statusCode).toEqual(422)
    expect(body.message).toEqual(message)
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
      payload: organisationFixture
    })

    expect(response.statusCode).toEqual(statusCode)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(`An internal server error occurred`)
    expect(server.loggerMocks.error).toHaveBeenCalledWith(error, {
      message: `Failure on ${organisationPath}`,
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

  it('returns 500 if error is thrown by sendEmail', async () => {
    const statusCode = 500
    const error = new Error('Notify API failed')
    sendEmail.mockRejectedValueOnce(error)

    const response = await server.inject({
      method: 'POST',
      url,
      payload: organisationFixture
    })

    expect(response.statusCode).toEqual(statusCode)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(`An internal server error occurred`)
    expect(server.loggerMocks.error).toHaveBeenCalledWith(error, {
      message: `Failure on ${organisationPath}`,
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
