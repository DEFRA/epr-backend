import { StatusCodes } from 'http-status-codes'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { defraIdMockAuthTokens } from '#vite/helpers/create-defra-id-test-tokens.js'

/**
 * @param {Object} params
 * @param {() => import('@hapi/hapi').Server} params.server
 * @param {() => Promise<{method: string, url: string, headers?: Object, payload?: Object}>} params.makeRequest
 * @param {((response: any) => void)=} params.additionalExpectations - Optional additional expectations
 * @param {number=} params.successStatus - Optional success status code (defaults to 200 OK)
 */
export function testOnlyServiceMaintainerCanAccess({
  server,
  makeRequest,
  additionalExpectations,
  successStatus = StatusCodes.OK
}) {
  describe('A user with', () => {
    const tokenScenarios = [
      {
        token: entraIdMockAuthTokens.validToken,
        description: 'a valid Entra token with the service maintainer role',
        expectedStatus: successStatus
      },
      {
        token: entraIdMockAuthTokens.nonServiceMaintainerUserToken,
        description:
          'a valid Entra token but without the service maintainer role',
        expectedStatus: StatusCodes.FORBIDDEN
      },
      {
        token: defraIdMockAuthTokens.unknownUnauthorisedUserToken,
        description:
          'a valid Defra Id token but with an unknown email and contactId',
        expectedStatus: StatusCodes.UNAUTHORIZED
      },
      {
        token: defraIdMockAuthTokens.validToken,
        description: 'a valid Defra Id token for a known public user',
        expectedStatus: StatusCodes.UNAUTHORIZED
      },
      {
        token: defraIdMockAuthTokens.unknownButAuthorisedUserToken,
        description:
          'a valid Defra Id token for an unknown user with a relationshipId pointing at the org',
        expectedStatus: StatusCodes.UNAUTHORIZED
      }
    ]

    it.each(tokenScenarios)(
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

/**
 * @param {Object} params
 * @param {() => import('@hapi/hapi').Server} params.server
 * @param {() => Promise<{method: string, url: string, headers?: Object, payload?: Object}>} params.makeRequest
 * @param {((response: any) => void)=} params.additionalExpectations - Optional additional expectations
 */
export function testOnlyStandardUserCanAccess({
  server,
  makeRequest,
  additionalExpectations
}) {
  describe('A user with', () => {
    const tokenScenarios = [
      {
        token: entraIdMockAuthTokens.validToken,
        description: 'a valid Entra token with the service maintainer role',
        expectedStatus: StatusCodes.UNAUTHORIZED
      },
      {
        token: entraIdMockAuthTokens.nonServiceMaintainerUserToken,
        description:
          'a valid Entra token but without the service maintainer role',
        expectedStatus: StatusCodes.FORBIDDEN
      },
      {
        token: defraIdMockAuthTokens.unknownUnauthorisedUserToken,
        description:
          'a valid Defra Id token but with an unknown email and contactId',
        expectedStatus: StatusCodes.UNAUTHORIZED
      },
      {
        token: defraIdMockAuthTokens.validToken,
        description: 'a valid Defra Id token for a known public user',
        expectedStatus: StatusCodes.OK
      },
      {
        token: defraIdMockAuthTokens.unknownButAuthorisedUserToken,
        description:
          'a valid Defra Id token for an unknown user with a relationshipId pointing at the org',
        expectedStatus: StatusCodes.OK
      }
    ]

    it.each(tokenScenarios)(
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

/**
 * @param {Object} params
 * @param {() => import('@hapi/hapi').Server} params.server
 * @param {() => Promise<{method: string, url: string, headers?: Object, payload?: Object}>} params.makeRequest
 * @param {((response: any) => void)=} params.additionalExpectations - Optional additional expectations
 */
export function testStandardUserAndServiceMaintainerCanAccess({
  server,
  makeRequest,
  additionalExpectations
}) {
  describe('A user with', () => {
    const tokenScenarios = [
      {
        token: entraIdMockAuthTokens.validToken,
        description: 'a valid Entra token with the service maintainer role',
        expectedStatus: StatusCodes.OK
      },
      {
        token: entraIdMockAuthTokens.nonServiceMaintainerUserToken,
        description:
          'a valid Entra token but without the service maintainer role',
        expectedStatus: StatusCodes.FORBIDDEN
      },
      {
        token: defraIdMockAuthTokens.unknownUnauthorisedUserToken,
        description:
          'a valid Defra Id token but with an unknown email and contactId',
        expectedStatus: StatusCodes.UNAUTHORIZED
      },
      {
        token: defraIdMockAuthTokens.validToken,
        description: 'a valid Defra Id token for a known public user',
        expectedStatus: StatusCodes.OK
      },
      {
        token: defraIdMockAuthTokens.unknownButAuthorisedUserToken,
        description:
          'a valid Defra Id token for an unknown user with a relationshipId pointing at the org',
        expectedStatus: StatusCodes.OK
      }
    ]

    it.each(tokenScenarios)(
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
