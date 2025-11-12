import { StatusCodes } from 'http-status-codes'
import { testTokens } from '#vite/helpers/create-test-tokens.js'

const {
  wrongSignatureToken,
  wrongIssuerToken,
  wrongAudienceToken,
  unauthorisedUserToken
} = testTokens

/**
 * Standard authentication test scenarios
 *
 * These scenarios cover the most common authentication failure cases:
 * - Invalid token signatures
 * - Tokens from unknown identity providers
 * - Tokens with incorrect audience claims
 * - Valid tokens but without required roles/permissions
 */
export const authScenarios = [
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

/**
 * Creates a reusable test suite for authentication scenarios
 *
 * This helper function generates a complete describe block with tests for common
 * authentication failure scenarios. It eliminates the need to duplicate auth
 * testing code across multiple endpoint test files.
 *
 * @param {Object} options - Configuration options
 * @param {Function} options.server - Function that returns the Hapi server instance
 * @param {Function} options.makeRequest - Async function that prepares and returns the request config
 *                                         (method, url, payload, etc.). Can include setup like
 *                                         inserting test data into the database.
 * @param {Function} [options.additionalExpectations] - Optional function for additional assertions
 *                                                       on the response (e.g., checking headers)
 *
 * @example
 * // Basic usage - GET endpoint
 * describe('GET /v1/organisations/{id}', () => {
 *   setupAuthContext()
 *   let server
 *   let organisationsRepository
 *
 *   beforeEach(async () => {
 *     // ... server setup
 *   })
 *
 *   testAuthScenarios({
 *     server: () => server,
 *     makeRequest: async () => {
 *       const org = buildOrganisation()
 *       await organisationsRepository.insert(org)
 *       return {
 *         method: 'GET',
 *         url: `/v1/organisations/${org.id}`
 *       }
 *     }
 *   })
 * })
 *
 * @example
 * // With additional expectations
 * testAuthScenarios({
 *   server: () => server,
 *   makeRequest: async () => ({
 *     method: 'POST',
 *     url: '/v1/organisations',
 *     payload: { name: 'Test Org' }
 *   }),
 *   additionalExpectations: (response) => {
 *     expect(response.headers['cache-control']).toBe('no-cache, no-store, must-revalidate')
 *     expect(response.headers['content-type']).toMatch(/application\/json/)
 *   }
 * })
 *
 * @example
 * // PUT endpoint with complex setup
 * testAuthScenarios({
 *   server: () => server,
 *   makeRequest: async () => {
 *     const org = buildOrganisation()
 *     await organisationsRepository.insert(org)
 *     return {
 *       method: 'PUT',
 *       url: `/v1/organisations/${org.id}`,
 *       payload: { name: 'Updated Name' }
 *     }
 *   },
 *   additionalExpectations: (response) => {
 *     expect(response.headers['cache-control']).toBe('no-cache, no-store, must-revalidate')
 *   }
 * })
 */
export function testAuthScenarios({
  server,
  makeRequest,
  additionalExpectations
}) {
  describe('user has wrong credentials', () => {
    it.each(authScenarios)(
      'returns $expectedStatus for user with $description',
      async ({ token, expectedStatus }) => {
        const requestConfig = await makeRequest()
        const response = await server().inject({
          ...requestConfig,
          headers: {
            ...requestConfig.headers,
            Authorization: `Bearer ${token}`
          }
        })

        expect(response.statusCode).toBe(expectedStatus)

        if (additionalExpectations) {
          additionalExpectations(response)
        }
      }
    )

    it('returns 401 for user without an authorization header', async () => {
      const requestConfig = await makeRequest()
      const response = await server().inject(requestConfig)

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)

      if (additionalExpectations) {
        additionalExpectations(response)
      }
    })
  })
}
