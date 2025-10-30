import { StatusCodes } from 'http-status-codes'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import {
  testServerFixture as test,
  describe,
  expect
} from '../../../test/create-test-server-fixture.js'

describe('GET /v1/organisations', () => {
  test('returns 200 and all organisations', async () => {
    const organisationsRepositoryFactory =
      createInMemoryOrganisationsRepository([])
    const organisationsRepository = organisationsRepositoryFactory()
    const featureFlags = createInMemoryFeatureFlags({ organisations: true })

    const server = await createTestServer({
      repositories: { organisationsRepository: organisationsRepositoryFactory },
      featureFlags
    })

    const org1 = buildOrganisation()
    const org2 = buildOrganisation()

    await organisationsRepository.insert(org1)
    await organisationsRepository.insert(org2)

    const response = await server.inject({
      method: 'GET',
      url: '/v1/organisations'
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe(org1.id)
    expect(result[1].id).toBe(org2.id)
  })
})
