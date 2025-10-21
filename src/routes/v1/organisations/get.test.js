import { StatusCodes } from 'http-status-codes'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'

async function setupServer(seed) {
  const organisationsRepositoryFactory =
    createInMemoryOrganisationsRepository(seed)
  const featureFlags = createInMemoryFeatureFlags({ organisations: true })

  return createTestServer({
    repositories: { organisationsRepository: organisationsRepositoryFactory },
    featureFlags
  })
}

describe('GET /v1/organisations', () => {
  it('returns 200 and all organisations', async () => {
    const seed = [
      { _id: 'mongo-1', orgId: 500123, name: 'Acme' },
      { _id: 'mongo-2', orgId: 500124, name: 'Beta' }
    ]
    const server = await setupServer(seed)

    const response = await server.inject({
      method: 'GET',
      url: '/v1/organisations'
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toEqual(seed)
  })
})
