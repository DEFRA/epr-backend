import { StatusCodes } from 'http-status-codes'

import { createInMemoryOrganisationReadRepository } from '#organisation-read-model/repository/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { asOperator, asRegulator, asSupport } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import {
  body,
  buildAccreditedOrganisation
} from './organisation-view-test-helpers.js'

describe('GET /organisations', () => {
  setupAuthContext()

  const acme = buildAccreditedOrganisation({ name: 'Acme Recycling' })
  const beta = buildAccreditedOrganisation({ name: 'Beta Recycling' })

  let server

  beforeEach(async () => {
    server = await createTestServer({
      repositories: {
        organisationReadRepository: createInMemoryOrganisationReadRepository([
          acme,
          beta
        ])
      }
    })
  })

  afterEach(async () => {
    await server.stop()
  })

  /**
   * @param {string} url
   * @param {object} [auth]
   */
  const get = (url, auth = asRegulator()) =>
    server.inject({ method: 'GET', url, ...auth })

  it('serves each organisation on the page as GET /organisations/{organisationNumber} serves it', async () => {
    const response = await get('/organisations?search=acme')
    const single = await get(`/organisations/${acme.organisationNumber}`)

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(body(response)).toEqual({
      items: [body(single)],
      page: 1,
      pageSize: 50,
      totalItems: 1,
      totalPages: 1
    })
  })

  it('finds an organisation by its number', async () => {
    const response = await get(
      `/organisations?organisationNumber=${beta.organisationNumber}`
    )

    expect(body(response).items.map(({ name }) => name)).toEqual([
      'Beta Recycling'
    ])
  })

  it('pages through the organisations in name order', async () => {
    const response = await get('/organisations?page=2&pageSize=1')

    expect(body(response)).toMatchObject({
      page: 2,
      pageSize: 1,
      totalItems: 2,
      totalPages: 2
    })
    expect(body(response).items.map(({ name }) => name)).toEqual([
      'Beta Recycling'
    ])
  })

  it('finds nothing for an organisation number that is not one', async () => {
    const response = await get(
      `/organisations?organisationNumber=0123456789abcdef01234567`
    )

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(body(response)).toEqual({
      items: [],
      page: 1,
      pageSize: 50,
      totalItems: 0,
      totalPages: 0
    })
  })

  it('serves admin users', async () => {
    const response = await get('/organisations', asSupport())

    expect(response.statusCode).toBe(StatusCodes.OK)
  })

  it('refuses an operator', async () => {
    const response = await get('/organisations', asOperator())

    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
  })
})
