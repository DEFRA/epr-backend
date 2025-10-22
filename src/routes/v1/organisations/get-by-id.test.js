import { StatusCodes } from 'http-status-codes'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { ObjectId } from 'mongodb'

/** @typedef {{ id: string, name: string }} Organisation */

/**
 * Helper to create a server with organisations routes enabled and seeded repo.
 * @param {Organisation[]} seed
 */
async function setupServer(seed) {
  const organisationsRepositoryFactory =
    createInMemoryOrganisationsRepository(seed)
  const featureFlags = createInMemoryFeatureFlags({ organisations: true })

  return createTestServer({
    repositories: { organisationsRepository: organisationsRepositoryFactory },
    featureFlags
  })
}

describe('GET /v1/organisations/{id}', () => {
  let server
  const initial = [
    { id: new ObjectId().toString(), name: 'Acme' },
    { id: new ObjectId().toString(), name: 'Beta' }
  ]

  describe('happy path', () => {
    beforeEach(async () => {
      server = await setupServer(initial)
    })

    it('returns 200 and the organisation when found', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${initial[0].id}`
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual({
        id: initial[0].id,
        name: 'Acme'
      })
    })
  })

  describe('not found cases', () => {
    beforeEach(async () => {
      server = await setupServer([
        { id: new ObjectId().toString(), name: 'Acme' }
      ])
    })

    it('returns 404 for orgId that does not exist', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/organisations/999999'
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns 404 when orgId is missing (whitespace-only path segment)', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/organisations/%20%20%20'
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })
})
