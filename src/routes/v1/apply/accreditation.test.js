import { vi, describe, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import {
  AUDIT_EVENT_ACTIONS,
  AUDIT_EVENT_CATEGORIES,
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import { FORM_FIELDS_SHORT_DESCRIPTIONS } from '#common/enums/index.js'
import accreditationFixture from '#data/fixtures/accreditation.json'
import { accreditationPath } from './accreditation.js'
import { it } from '#vite/fixtures/server-with-mock-db.js'

const mockAudit = vi.fn()
const mockInsertOne = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockAudit(...args)
}))

const url = accreditationPath

describe(`${url} route`, () => {
  beforeEach(() => {
    mockAudit.mockClear()
    mockInsertOne.mockClear()
  })

  it('returns 201 and echoes back payload on valid request', async ({
    server
  }) => {
    const collectionSpy = vi.spyOn(server.db, 'collection')

    collectionSpy.mockReturnValue({
      insertOne: mockInsertOne
    })

    const response = await server.inject({
      method: 'POST',
      url,
      payload: accreditationFixture
    })

    expect(response.statusCode).toEqual(StatusCodes.CREATED)

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

  it('returns 400 if payload is not an object', async ({ server }) => {
    const response = await server.inject({
      method: 'POST',
      url,
      payload: 'not-an-object'
    })

    expect(response.statusCode).toEqual(StatusCodes.BAD_REQUEST)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(/Invalid request payload JSON format/)
  })

  it('returns 400 if payload is null', async ({ server }) => {
    const response = await server.inject({
      method: 'POST',
      url,
      payload: null
    })

    expect(response.statusCode).toEqual(StatusCodes.BAD_REQUEST)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(/Invalid payload/)
  })

  it('returns 422 if payload is missing orgId', async ({ server }) => {
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

    expect(response.statusCode).toEqual(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(body.message).toEqual(message)
  })

  it('returns 422 if payload is missing reference number', async ({
    server
  }) => {
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

    expect(response.statusCode).toEqual(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(body.message).toEqual(message)
  })

  it('returns 500 if error is thrown by insertOne', async ({ server }) => {
    const collectionSpy = vi.spyOn(server.db, 'collection')

    collectionSpy.mockReturnValue({
      insertOne: mockInsertOne
    })

    const statusCode = StatusCodes.INTERNAL_SERVER_ERROR
    const error = new Error('db.collection.insertOne failed')
    mockInsertOne.mockImplementationOnce(() => {
      throw error
    })

    const response = await server.inject({
      method: 'POST',
      url,
      payload: accreditationFixture
    })

    expect(response.statusCode).toEqual(statusCode)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(`An internal server error occurred`)
    expect(server.loggerMocks.error).toHaveBeenCalledWith({
      err: error,
      message: `Failure on ${accreditationPath} for orgId: 500000 and referenceNumber: 68a66ec3dabf09f3e442b2da, mongo validation failures: `,
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

  it('returns 500 if insertOne fails with mongo validation failures', async ({
    server
  }) => {
    const collectionSpy = vi.spyOn(server.db, 'collection')

    collectionSpy.mockReturnValue({
      insertOne: mockInsertOne
    })

    const statusCode = StatusCodes.INTERNAL_SERVER_ERROR
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
      payload: accreditationFixture
    })

    expect(response.statusCode).toEqual(statusCode)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(`An internal server error occurred`)
    expect(server.loggerMocks.error).toHaveBeenCalledWith({
      err: error,
      message: `Failure on ${accreditationPath} for orgId: 500000 and referenceNumber: 68a66ec3dabf09f3e442b2da, mongo validation failures: orgId - 'orgId' must be a positive integer above 500000 and is required`,
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
