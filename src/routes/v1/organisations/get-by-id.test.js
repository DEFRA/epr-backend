import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { StatusCodes } from 'http-status-codes'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#test/helpers/setup-auth-mocking.js'
import { testTokens } from '#test/helpers/create-test-tokens.js'

const {
  validToken,
  wrongSignatureToken,
  wrongIssuerToken,
  wrongAudienceToken,
  unauthorisedUserToken
} = testTokens

describe('GET /v1/organisations/{id}', () => {
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

  describe('happy path', () => {
    it('returns 200 and the organisation when found', async () => {
      const org1 = buildOrganisation()
      const org2 = buildOrganisation()

      await organisationsRepository.insert(org1)
      await organisationsRepository.insert(org2)

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${org1.id}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result.id).toBe(org1.id)
      expect(result.orgId).toBe(org1.orgId)
    })

    it('includes Cache-Control header in successful response', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${org.id}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    })
  })

  describe('not found cases', () => {
    it('returns 404 for orgId that does not exist', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/organisations/999999',
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns 404 when orgId is missing (whitespace-only path segment)', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/organisations/%20%20%20',
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('includes Cache-Control header in error response', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/organisations/999999',
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    })
  })

  describe('user has wrong credentials', () => {
    const authScenarios = [
      {
        token: wrongSignatureToken,
        description: 'made-up token',
        expectedStatus: StatusCodes.UNAUTHORIZED
      },
      {
        token: wrongIssuerToken,
        description: 'token from an unknown Identity Provider',
        expectedStatus: StatusCodes.UNAUTHORIZED
      },
      {
        token: wrongAudienceToken,
        description: 'token from an unknown Audience (client)',
        expectedStatus: StatusCodes.UNAUTHORIZED
      },
      {
        token: unauthorisedUserToken,
        description: 'user without the service maintainer role',
        expectedStatus: StatusCodes.FORBIDDEN
      }
    ]

    it.each(authScenarios)(
      'returns $expectedStatus for user with $description',
      async ({ token, expectedStatus }) => {
        const org1 = buildOrganisation()

        await organisationsRepository.insert(org1)

        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${org1.id}`,
          headers: {
            Authorization: `Bearer ${token}`
          }
        })

        expect(response.statusCode).toBe(expectedStatus)
        expect(response.headers['cache-control']).toBe(
          'no-cache, no-store, must-revalidate'
        )
      }
    )

    it('returns 401 for user without an authorization header', async () => {
      const org1 = buildOrganisation()

      await organisationsRepository.insert(org1)

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${org1.id}`
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    })

    it('returns 401 for user with a made-up token', async () => {
      const org1 = buildOrganisation()

      await organisationsRepository.insert(org1)

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${org1.id}`,
        headers: {
          Authorization: `Bearer ${wrongSignatureToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    })

    it('returns 401 for user with a token from an unknown Identity Provider', async () => {
      const org1 = buildOrganisation()

      await organisationsRepository.insert(org1)

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${org1.id}`,
        headers: {
          Authorization: `Bearer ${wrongIssuerToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    })

    it('returns 401 for user with a token from an unknown Audience (client)', async () => {
      const org1 = buildOrganisation()

      await organisationsRepository.insert(org1)

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${org1.id}`,
        headers: {
          Authorization: `Bearer ${wrongAudienceToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    })

    it('returns 403 for user without the service maintainer role', async () => {
      const org1 = buildOrganisation()

      await organisationsRepository.insert(org1)

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${org1.id}`,
        headers: {
          Authorization: `Bearer ${unauthorisedUserToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    })
  })
})
