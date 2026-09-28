import { StatusCodes } from 'http-status-codes'
import { afterEach, describe, expect, it } from 'vitest'
import { defraIdMockAuthTokens } from '#vite/helpers/create-defra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
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

  it('returns the accreditation the registration holds for 2026, as the organisation holds it', async () => {
    const { organisation, registration, accreditation } =
      buildAccreditedOrganisation()
    server = await startServer([organisation])

    const response = await server.inject({
      method: 'GET',
      url: pathFor(registration.id, 2026),
      headers: basicAuthHeaders
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const stored = await createInMemoryOrganisationsRepository(
      /** @type {any} */ ([organisation])
    )().findAccreditationById(organisation.id, accreditation.id)
    expect(JSON.parse(response.payload)).toStrictEqual(
      JSON.parse(JSON.stringify(stored))
    )
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
