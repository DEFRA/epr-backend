import { StatusCodes } from 'http-status-codes'
import { afterEach, describe, expect, it } from 'vitest'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import {
  basicAuthHeaders,
  buildAccreditedOrganisation,
  startServer
} from './test-helpers.js'

/** @import { TestServer } from '#test/create-test-server.js' */

describe('GET /v1/accreditations', () => {
  setupAuthContext()

  /** @type {TestServer | undefined} */
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  /** @param {string} query */
  const list = (query) =>
    /** @type {TestServer} */ (server).inject({
      method: 'GET',
      url: `/v1/accreditations?${query}`,
      headers: basicAuthHeaders
    })

  it('lists every accreditation held for 2026 across organisations, ordered by id', async () => {
    const first = buildAccreditedOrganisation({ accreditationNumber: 'ACC-1' })
    const second = buildAccreditedOrganisation({ accreditationNumber: 'ACC-2' })
    server = await startServer([first.organisation, second.organisation])

    const response = await list('year=2026')

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(
      JSON.parse(response.payload).map(
        (/** @type {{ id: string }} */ item) => item.id
      )
    ).toStrictEqual(
      [first.accreditation.id, second.accreditation.id].sort((a, b) =>
        a.localeCompare(b)
      )
    )
  })

  it('narrows to the registrations asked for', async () => {
    const first = buildAccreditedOrganisation()
    const second = buildAccreditedOrganisation()
    server = await startServer([first.organisation, second.organisation])

    const response = await list(
      `year=2026&registrationId=${second.registration.id}`
    )

    const body = JSON.parse(response.payload)
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({ id: second.accreditation.id })
  })

  it('accepts registrationId repeated', async () => {
    const first = buildAccreditedOrganisation()
    const second = buildAccreditedOrganisation()
    const third = buildAccreditedOrganisation()
    server = await startServer([
      first.organisation,
      second.organisation,
      third.organisation
    ])

    const response = await list(
      `year=2026&registrationId=${first.registration.id}&registrationId=${third.registration.id}`
    )

    expect(JSON.parse(response.payload)).toHaveLength(2)
  })

  it('returns an empty list for a year this service holds no accreditations for', async () => {
    const { organisation } = buildAccreditedOrganisation()
    server = await startServer([organisation])

    const response = await list('year=2027')

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toStrictEqual([])
  })

  it('requires a year', async () => {
    server = await startServer([])

    const response = await list('')

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('returns 401 without credentials', async () => {
    server = await startServer([])

    const response = await server.inject({
      method: 'GET',
      url: '/v1/accreditations?year=2026'
    })

    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
  })
})
