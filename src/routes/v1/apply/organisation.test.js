import { vi, describe, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'
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
import { createFormSubmissionsRepository } from '#repositories/form-submissions/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { organisationPath } from './organisation.js'
import { sendEmail } from '#common/helpers/notify.js'
import organisationFixture from '#data/fixtures/organisation.json' with { type: 'json' }

const mockAudit = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockAudit(...args)
}))

vi.mock('#common/helpers/notify.js')

const url = organisationPath

describe(`${url} route`, () => {
  setupAuthContext()

  let server
  let formSubmissionsRepository

  beforeEach(async () => {
    mockAudit.mockClear()
    formSubmissionsRepository = createFormSubmissionsRepository()()
    server = await createTestServer({
      repositories: { formSubmissionsRepository }
    })
  })

  it('returns 200 and stores the organisation on valid request', async () => {
    const response = await server.inject({
      method: 'POST',
      url,
      payload: organisationFixture
    })

    expect(response.statusCode).toEqual(StatusCodes.OK)

    const { orgId, orgName, referenceNumber } = JSON.parse(response.payload)
    expect(orgName).toBe('ACME ltd')

    const stored =
      await formSubmissionsRepository.findOrganisationById(referenceNumber)
    expect(stored.orgId).toBe(orgId)
    expect(stored.rawSubmissionData).toEqual(organisationFixture)

    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: AUDIT_EVENT_CATEGORIES.DB,
        action: AUDIT_EVENT_ACTIONS.DB_INSERT
      },
      context: { orgId, orgName, referenceNumber }
    })
    expect(sendEmail).toHaveBeenCalledWith(
      ORGANISATION_SUBMISSION_USER_CONFIRMATION_EMAIL_TEMPLATE_ID,
      'alice@foo.com',
      { orgId, orgName, referenceNumber }
    )
    expect(sendEmail).toHaveBeenCalledWith(
      ORGANISATION_SUBMISSION_REGULATOR_CONFIRMATION_EMAIL_TEMPLATE_ID,
      'test@ea.gov.uk',
      { orgId, orgName, referenceNumber }
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

  it('allocates a fresh orgId to each organisation', async () => {
    const submit = async () =>
      JSON.parse(
        (
          await server.inject({
            method: 'POST',
            url,
            payload: organisationFixture
          })
        ).payload
      )

    const first = await submit()
    const second = await submit()

    expect(second.orgId).toBe(first.orgId + 1)
    expect(second.referenceNumber).not.toBe(first.referenceNumber)
  })

  it('returns 400 if payload is not an object', async () => {
    const response = await server.inject({
      method: 'POST',
      url,
      payload: 'not-an-object'
    })

    expect(response.statusCode).toEqual(StatusCodes.BAD_REQUEST)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(/Invalid request payload JSON format/)
  })

  it('returns 400 if payload is null', async () => {
    const response = await server.inject({ method: 'POST', url, payload: null })

    expect(response.statusCode).toEqual(StatusCodes.BAD_REQUEST)
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
        data: { main: { asd456: 'ACME LTD' } }
      }
    })

    const body = JSON.parse(response.payload)

    expect(response.statusCode).toEqual(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(body.message).toEqual('Could not extract email from answers')
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
        data: { main: { asd123: 'a@b.com' } }
      }
    })

    const body = JSON.parse(response.payload)

    expect(response.statusCode).toEqual(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(body.message).toEqual(
      'Could not extract organisation name from answers'
    )
  })

  it('returns 422 if payload is missing regulatorEmail', async () => {
    const response = await server.inject({
      method: 'POST',
      url,
      payload: {
        meta: { definition: { name: undefined } },
        data: { main: {} }
      }
    })

    const body = JSON.parse(response.payload)

    expect(response.statusCode).toEqual(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(body.message).toEqual('Could not get regulator name from data')
  })

  it('returns 500 if the organisation cannot be stored', async () => {
    const error = new Error('insertOrganisation failed')
    const failingServer = await createTestServer({
      repositories: {
        formSubmissionsRepository: {
          ...formSubmissionsRepository,
          insertOrganisation: () => Promise.reject(error)
        }
      }
    })

    const response = await failingServer.inject({
      method: 'POST',
      url,
      payload: organisationFixture
    })

    expect(response.statusCode).toEqual(StatusCodes.INTERNAL_SERVER_ERROR)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch('An internal server error occurred')
    expect(failingServer.loggerMocks.error).toHaveBeenCalledWith({
      err: error,
      message: `Failure on ${organisationPath}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
      },
      http: {
        response: { status_code: StatusCodes.INTERNAL_SERVER_ERROR }
      }
    })
  })

  it('returns 500 if a confirmation email cannot be sent', async () => {
    const error = new Error('Notify API failed')
    vi.mocked(sendEmail).mockRejectedValueOnce(error)

    const response = await server.inject({
      method: 'POST',
      url,
      payload: organisationFixture
    })

    expect(response.statusCode).toEqual(StatusCodes.INTERNAL_SERVER_ERROR)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch('An internal server error occurred')
    expect(server.loggerMocks.error).toHaveBeenCalledWith({
      err: error,
      message: `Failure on ${organisationPath}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
      },
      http: {
        response: { status_code: StatusCodes.INTERNAL_SERVER_ERROR }
      }
    })
  })
})
