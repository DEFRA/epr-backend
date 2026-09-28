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

  it('lists every accreditation held for 2026 across organisations', async () => {
    const first = buildAccreditedOrganisation({ accreditationNumber: 'ACC-1' })
    const second = buildAccreditedOrganisation({ accreditationNumber: 'ACC-2' })
    server = await startServer([first.organisation, second.organisation])

    const response = await list('year=2026')

    expect(response.statusCode).toBe(StatusCodes.OK)
    const body = JSON.parse(response.payload)
    expect(body).toMatchObject({
      page: 1,
      pageSize: 100,
      totalItems: 2,
      totalPages: 1
    })
    expect(
      body.items.map(
        (/** @type {{ registrationId: string }} */ item) => item.registrationId
      )
    ).toEqual(
      expect.arrayContaining([first.registration.id, second.registration.id])
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
    expect(body.totalItems).toBe(1)
    expect(body.items[0]).toMatchObject({
      id: second.accreditation.id,
      registrationId: second.registration.id
    })
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

    expect(JSON.parse(response.payload).totalItems).toBe(2)
  })

  it('pages in a stable order', async () => {
    const organisations = [1, 2, 3].map(() => buildAccreditedOrganisation())
    server = await startServer(organisations.map((o) => o.organisation))

    const firstPage = JSON.parse((await list('year=2026&pageSize=2')).payload)
    const secondPage = JSON.parse(
      (await list('year=2026&pageSize=2&page=2')).payload
    )

    expect(firstPage).toMatchObject({ totalItems: 3, totalPages: 2 })
    expect(firstPage.items).toHaveLength(2)
    expect(secondPage.items).toHaveLength(1)
    const ids = [...firstPage.items, ...secondPage.items].map(
      (/** @type {{ id: string }} */ item) => item.id
    )
    expect(ids).toStrictEqual([...ids].sort((a, b) => a.localeCompare(b)))
  })

  it('returns an empty page for a year this service holds no accreditations for', async () => {
    const { organisation } = buildAccreditedOrganisation()
    server = await startServer([organisation])

    const response = await list('year=2027')

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toStrictEqual({
      items: [],
      page: 1,
      pageSize: 100,
      totalItems: 0,
      totalPages: 0
    })
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
