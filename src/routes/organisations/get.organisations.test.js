import { StatusCodes } from 'http-status-codes'

import { overseasSites } from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import { createTestServer } from '#test/create-test-server.js'
import { asOperator, asRegulator, asSupport } from '#test/inject-auth.js'
import { partialMock } from '#test/type-helpers.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import {
  body,
  createAccreditedOrganisationBuilder
} from './organisation-view-test-helpers.js'

const organisationBuilders = createOrganisationBuilders()
const buildAccreditedOrganisation =
  createAccreditedOrganisationBuilder(organisationBuilders)

describe('GET /organisations', () => {
  setupAuthContext()

  const acme = buildAccreditedOrganisation({
    companyDetails: { name: 'Acme Recycling' }
  })
  const beta = buildAccreditedOrganisation({
    companyDetails: { name: 'Beta Recycling' }
  })

  let server

  beforeEach(async () => {
    server = await createTestServer({
      repositories: {
        organisationsRepository: createInMemoryOrganisationsRepository(
          [acme, beta].map((organisation) => partialMock(organisation))
        ),
        overseasSitesRepository:
          createInMemoryOverseasSitesRepository(overseasSites)
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
    const single = await get(`/organisations/${acme.orgId}`)

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(body(response)).toEqual({
      items: [body(single)],
      page: 1,
      pageSize: 50,
      totalItems: 1,
      totalPages: 1
    })
  })

  it('serves no database id', async () => {
    const response = await get('/organisations?search=acme')

    expect(JSON.stringify(body(response))).not.toContain(acme.id)
  })

  it('finds an organisation by its number', async () => {
    const response = await get(
      `/organisations?organisationNumber=${beta.orgId}`
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

  it('finds nothing for an organisation number that is not one, such as a database id', async () => {
    const response = await get(`/organisations?organisationNumber=${acme.id}`)

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
