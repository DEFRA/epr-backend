/** @import { CognitoAccessTokenPayload } from '#common/helpers/auth/types.js' */

import { StatusCodes } from 'http-status-codes'

export const externalApiAuthPlugin = {
  plugin: {
    name: 'external-api-auth',
    version: '1.0.0',
    /**
     * @param {import('@hapi/hapi').Server} server
     * @param {{ clientId: string }} options
     */
    register: (server, options) => {
      const { clientId } = options

      server.auth.strategy('api-gateway-client', 'jwt', {
        keys: { key: 'not-verified', algorithms: ['HS256'] },
        verify: false,
        validate: (
          /** @type {{ decoded: { payload: CognitoAccessTokenPayload } }} */ artifacts,
          _request,
          h
        ) => {
          const tokenClientId = artifacts.decoded.payload.client_id
          if (!tokenClientId) {
            return { isValid: false }
          }

          if (tokenClientId !== clientId) {
            const statusCode = StatusCodes.FORBIDDEN

            return {
              isValid: false,
              response: h
                .response({
                  statusCode,
                  error: 'Forbidden'
                })
                .code(statusCode)
                .takeover()
            }
          }

          return {
            isValid: true,
            credentials: { id: clientId, name: 'RPD' }
          }
        }
      })
    }
  }
}
