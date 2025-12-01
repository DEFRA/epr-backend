import { StatusCodes } from 'http-status-codes'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
// import { defraIdMockAuthTokens } from '#vite/helpers/create-defra-id-test-tokens.js'

export function testOnlyServiceMaintainerCanAccess({
  server,
  makeRequest,
  additionalExpectations
}) {
  describe('A user withou the service maintainer role', () => {
    const wrongRoleTokenScenarios = [
      {
        token: entraIdMockAuthTokens.nonServiceMaintainerUserToken,
        description:
          'user a valid Entra Id but without the service maintainer role',
        expectedStatus: StatusCodes.FORBIDDEN
      }
    ]

    it.each(wrongRoleTokenScenarios)(
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
  })
}
