import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { config } from '#root/config.js'
import { createTestServer } from '#test/create-test-server.js'
import { defraIdMockAuthTokens } from '#vite/helpers/create-defra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { StatusCodes } from 'http-status-codes'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { validToken } = defraIdMockAuthTokens

describe('GET /v1/me/organisations', () => {
  setupAuthContext()

  beforeAll(() => {
    config.set('featureFlags.defraIdAuth', true)
  })

  afterAll(() => {
    config.reset('featureFlags.defraIdAuth')
  })

  it('returns 200 and all linked organisations for a user', async () => {
    const organisationsRepositoryFactory =
      createInMemoryOrganisationsRepository([])
    const organisationsRepository = organisationsRepositoryFactory()
    const featureFlags = createInMemoryFeatureFlags({
      organisations: true
    })

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
      url: '/v1/me/organisations',
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe(org1.id)
    expect(result[1].id).toBe(org2.id)
  })
})
