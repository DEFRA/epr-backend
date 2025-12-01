import { StatusCodes } from 'http-status-codes'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'

export function testInvalidTokenScenarios({
  server,
  makeRequest,
  additionalExpectations
}) {
  describe('Invalid tokens', () => {
    describe('user has an Entra token with the wrong credentials', () => {
      const {
        wrongSignatureToken,
        wrongIssuerToken,
        wrongAudienceToken,
        unauthorisedUserToken
      } = entraIdMockAuthTokens

      const invalidEntraTokenScenarios = [
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

      it.each(invalidEntraTokenScenarios)(
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
  })
}
