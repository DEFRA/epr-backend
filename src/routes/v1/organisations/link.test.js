import { StatusCodes } from 'http-status-codes'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { ObjectId } from 'mongodb'
import { defraIdMockAuthTokens } from '#vite/helpers/create-defra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { testInvalidTokenScenarios } from '#vite/helpers/test-invalid-token-scenarios.js'
import { testOnlyServiceMaintainerCanAccess } from '#vite/helpers/test-invalid-roles-scenarios.js'

const { validToken } = defraIdMockAuthTokens

describe('POST /v1/organisations/{organisationId}/link', () => {
  setupAuthContext()
  let server
  let organisationsRepositoryFactory
  let organisationsRepository

  beforeEach(async () => {
    organisationsRepositoryFactory = createInMemoryOrganisationsRepository([])
    organisationsRepository = organisationsRepositoryFactory()
    const featureFlags = createInMemoryFeatureFlags({ organisations: true })

    server = await createTestServer({
      repositories: { organisationsRepository: organisationsRepositoryFactory },
      featureFlags
    })
  })

  testInvalidTokenScenarios({
    server: () => server,
    makeRequest: async () => {
      const org1 = buildOrganisation()
      await organisationsRepository.insert(org1)
      return {
        method: 'POST',
        url: `/v1/organisations/${org1.id}/link`
      }
    },
    additionalExpectations: (response) => {
      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    }
  })

  describe('the request contains a valid Defra Id token', () => {
    it('when the organisation does not exist, returns 404', async () => {
      const existingOrg = buildOrganisation()
      const nonExistingOrg = buildOrganisation()
      await organisationsRepository.insert(existingOrg)
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${nonExistingOrg.id}/link`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })
      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })
  })
})
