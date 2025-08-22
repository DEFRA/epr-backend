import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../../../common/enums/event.js'
import {
  FORM_FIELDS_SHORT_DESCRIPTIONS,
  NATION,
  USER_SUBMISSION_EMAIL_TEMPLATE_ID
} from '../../../common/enums/index.js'
import { organisationPath } from './organisation.js'
import { sendEmail } from '../../../common/helpers/notify.js'
import organisationFixture from '../../../data/fixtures/organisation.json'

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

vi.mock('../../../common/helpers/notify.js')

const url = organisationPath
let server

describe(`${url} route`, () => {
  beforeAll(async () => {
    const { createServer } = await import('../../../server.js')
    server = await createServer()
    await server.initialize()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 and echoes back payload on valid request', async () => {
    const response = await server.inject({
      method: 'POST',
      url,
      payload: organisationFixture
    })

    expect(response.statusCode).toEqual(200)
    expect(sendEmail).toHaveBeenCalledWith(
      USER_SUBMISSION_EMAIL_TEMPLATE_ID,
      'alice@foo.com',
      {
        orgId: 500002,
        orgName: 'ACME ltd',
        referenceNumber: expect.any(String)
      }
    )
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

  it('returns 400 if payload is missing email', async () => {
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
                    shortDescription: FORM_FIELDS_SHORT_DESCRIPTIONS.NATIONS,
                    title: 'Which nations do you operate within?',
                    type: 'CheckboxesField'
                  }
                ]
              },
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
            asd123: `${NATION.ENGLAND}, ${NATION.SCOTLAND}`,
            asd456: 'ACME LTD'
          }
        }
      }
    })

    const message = 'Could not extract email from answers'
    const body = JSON.parse(response.payload)

    expect(response.statusCode).toEqual(400)
    expect(body.message).toEqual(message)
  })

  it('returns 400 if payload is missing nations', async () => {
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
                    shortDescription: FORM_FIELDS_SHORT_DESCRIPTIONS.EMAIL,
                    title: 'What is your email address?',
                    type: 'EmailAddressField'
                  }
                ]
              },
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
            asd123: 'a@b.com',
            asd456: 'ACME LTD'
          }
        }
      }
    })

    const message = 'Could not extract nations from answers'
    const body = JSON.parse(response.payload)

    expect(response.statusCode).toEqual(400)
    expect(body.message).toEqual(message)
  })

  it('returns 400 if payload is missing orgName', async () => {
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
                    shortDescription: FORM_FIELDS_SHORT_DESCRIPTIONS.NATIONS,
                    title: 'Which nations do you operate within?',
                    type: 'CheckboxesField'
                  }
                ]
              },
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
            asd123: `${NATION.ENGLAND}, ${NATION.SCOTLAND}`,
            asd456: 'a@b.com'
          }
        }
      }
    })

    const message = 'Could not extract organisation name from answers'
    const body = JSON.parse(response.payload)

    expect(response.statusCode).toEqual(400)
    expect(body.message).toEqual(message)
  })

  it('returns 500 if error is thrown', async () => {
    const errorMessage = 'Notify API failed'
    const error = new Error(errorMessage)
    sendEmail.mockRejectedValueOnce(error)

    const response = await server.inject({
      method: 'POST',
      url,
      payload: organisationFixture
    })

    expect(response.statusCode).toEqual(500)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(`An internal server error occurred`)
    expect(mockLoggerError).toHaveBeenCalledWith(error, {
      message: `Failure on ${organisationPath}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
      }
    })
  })
})
