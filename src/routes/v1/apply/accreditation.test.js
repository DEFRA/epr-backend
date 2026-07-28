import { vi, describe, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import {
  AUDIT_EVENT_ACTIONS,
  AUDIT_EVENT_CATEGORIES,
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import { FORM_FIELDS_SHORT_DESCRIPTIONS } from '#common/enums/index.js'
import { createFormSubmissionsRepository } from '#repositories/form-submissions/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import accreditationFixture from '#data/fixtures/accreditation.json' with { type: 'json' }
import { accreditationPath } from './accreditation.js'

const mockAudit = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockAudit(...args)
}))

const url = accreditationPath

const FIXTURE_ORG_ID = 500000
const FIXTURE_REFERENCE_NUMBER = '68a66ec3dabf09f3e442b2da'

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

  const serverRejectingInsertWith = (error) =>
    createTestServer({
      repositories: {
        formSubmissionsRepository: {
          ...formSubmissionsRepository,
          insertAccreditation: () => Promise.reject(error)
        }
      }
    })

  it('returns 201 and stores the accreditation on valid request', async () => {
    const response = await server.inject({
      method: 'POST',
      url,
      payload: accreditationFixture
    })

    expect(response.statusCode).toEqual(StatusCodes.CREATED)

    const stored =
      await formSubmissionsRepository.findAccreditationsBySystemReference(
        FIXTURE_REFERENCE_NUMBER
      )
    expect(stored).toHaveLength(1)
    expect(stored[0].orgId).toBe(FIXTURE_ORG_ID)
    expect(stored[0].rawSubmissionData).toEqual(accreditationFixture)

    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: AUDIT_EVENT_CATEGORIES.DB,
        action: AUDIT_EVENT_ACTIONS.DB_INSERT
      },
      context: {
        orgId: FIXTURE_ORG_ID,
        referenceNumber: FIXTURE_REFERENCE_NUMBER
      }
    })

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
        data: { main: { asd123: FIXTURE_REFERENCE_NUMBER } }
      }
    })

    const body = JSON.parse(response.payload)

    expect(response.statusCode).toEqual(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(body.message).toEqual('Could not extract orgId from answers')
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
        data: { main: { asd456: '500019' } }
      }
    })

    const body = JSON.parse(response.payload)

    expect(response.statusCode).toEqual(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(body.message).toEqual(
      'Could not extract referenceNumber from answers'
    )
  })

  it('returns 500 if the accreditation cannot be stored', async () => {
    const error = new Error('insertAccreditation failed')
    const failingServer = await serverRejectingInsertWith(error)

    const response = await failingServer.inject({
      method: 'POST',
      url,
      payload: accreditationFixture
    })

    expect(response.statusCode).toEqual(StatusCodes.INTERNAL_SERVER_ERROR)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch('An internal server error occurred')
    expect(failingServer.loggerMocks.error).toHaveBeenCalledWith({
      err: error,
      message: `Failure on ${accreditationPath} for orgId: ${FIXTURE_ORG_ID} and referenceNumber: ${FIXTURE_REFERENCE_NUMBER}, mongo validation failures: `,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
      },
      http: {
        response: { status_code: StatusCodes.INTERNAL_SERVER_ERROR }
      }
    })
  })

  it('names the rejected fields when the store reports schema violations', async () => {
    const error = Object.assign(new Error('insertAccreditation failed'), {
      schemaViolations: [
        "orgId - 'orgId' must be a positive integer above 500000 and is required"
      ]
    })
    const failingServer = await serverRejectingInsertWith(error)

    const response = await failingServer.inject({
      method: 'POST',
      url,
      payload: accreditationFixture
    })

    expect(response.statusCode).toEqual(StatusCodes.INTERNAL_SERVER_ERROR)
    expect(failingServer.loggerMocks.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: `Failure on ${accreditationPath} for orgId: ${FIXTURE_ORG_ID} and referenceNumber: ${FIXTURE_REFERENCE_NUMBER}, mongo validation failures: orgId - 'orgId' must be a positive integer above 500000 and is required`
      })
    )
  })
})
