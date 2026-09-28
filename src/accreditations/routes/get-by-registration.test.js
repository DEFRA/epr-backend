import { StatusCodes } from 'http-status-codes'
import { afterEach, describe, expect, it } from 'vitest'
import { defraIdMockAuthTokens } from '#vite/helpers/create-defra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import {
  basicAuthHeaders,
  buildAccreditedOrganisation,
  startServer
} from './test-helpers.js'

/** @import { TestServer } from '#test/create-test-server.js' */

/**
 * @param {string} registrationId
 * @param {number} year
 */
const pathFor = (registrationId, year) =>
  `/v1/registrations/${registrationId}/accreditation/${year}`

describe('GET /v1/registrations/{registrationId}/accreditation/{year}', () => {
  setupAuthContext()

  /** @type {TestServer | undefined} */
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  it('returns the accreditation the registration holds for 2026', async () => {
    const { organisation, registration, accreditation } =
      buildAccreditedOrganisation()
    server = await startServer([organisation])

    const response = await server.inject({
      method: 'GET',
      url: pathFor(registration.id, 2026),
      headers: basicAuthHeaders
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toStrictEqual({
      id: accreditation.id,
      registrationId: registration.id,
      year: 2026,
      status: 'approved',
      statusHistory: [
        { status: 'created', updatedAt: '2025-08-20T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2026-01-10T00:00:00.000Z' }
      ],
      accreditationNumber: 'A26SR5120384065PA',
      validFrom: '2026-01-01',
      prnIssuance: {
        tonnageBand: 'over_10000',
        signatories: [
          {
            fullName: 'Yoda',
            email: 'yoda@starwars.com',
            phone: '1234567890',
            jobTitle: 'PRN signatory'
          }
        ]
      },
      submitterContactDetails: {
        fullName: 'Yoda',
        email: 'yoda@starwars.com',
        phone: '1234567890',
        jobTitle: 'PRN signatory'
      }
    })
  })

  it('returns 404 for a year this service holds no accreditations for', async () => {
    const { organisation, registration } = buildAccreditedOrganisation()
    server = await startServer([organisation])

    const response = await server.inject({
      method: 'GET',
      url: pathFor(registration.id, 2027),
      headers: basicAuthHeaders
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('returns 404 for a registration that holds no accreditation', async () => {
    const { organisation, registeredOnly } = buildAccreditedOrganisation()
    server = await startServer([organisation])

    const response = await server.inject({
      method: 'GET',
      url: pathFor(registeredOnly.id, 2026),
      headers: basicAuthHeaders
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('returns 404 for a registration no organisation holds', async () => {
    const { organisation } = buildAccreditedOrganisation()
    server = await startServer([organisation])

    const response = await server.inject({
      method: 'GET',
      url: pathFor('000000000000000000000000', 2026),
      headers: basicAuthHeaders
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('returns 401 without credentials', async () => {
    const { organisation, registration } = buildAccreditedOrganisation()
    server = await startServer([organisation])

    const response = await server.inject({
      method: 'GET',
      url: pathFor(registration.id, 2026)
    })

    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
  })

  it('rejects an operator access token', async () => {
    const { organisation, registration } = buildAccreditedOrganisation()
    server = await startServer([organisation])

    const response = await server.inject({
      method: 'GET',
      url: pathFor(registration.id, 2026),
      headers: { Authorization: `Bearer ${defraIdMockAuthTokens.validToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
  })

  it('returns 422 for a year that is not a number', async () => {
    const { organisation, registration } = buildAccreditedOrganisation()
    server = await startServer([organisation])

    const response = await server.inject({
      method: 'GET',
      url: `/v1/registrations/${registration.id}/accreditation/next`,
      headers: basicAuthHeaders
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })
})
