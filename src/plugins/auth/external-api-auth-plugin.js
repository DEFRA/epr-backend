/** @import { CognitoAccessTokenPayload } from '#common/helpers/auth/types.js' */

import { StatusCodes } from 'http-status-codes'

const EXPECTED_TOKEN_USE = 'access'
const ONE_HOUR = 3600

export const externalApiAuthPlugin = {
  plugin: {
    name: 'external-api-auth',
    version: '1.0.0',
    /**
     * @param {import('@hapi/hapi').Server} server
     * @param {{ config: import('convict').Config }} options
     */
    register: (server, { config }) => {
      const clientId = config.get('packagingRecyclingNotesExternalApi.clientId')

      server.auth.strategy('api-gateway-client', 'jwt', {
        keys: [
          {
            uri: config.get('packagingRecyclingNotesExternalApi.jwksUri')
          }
        ],
        verify: {
          aud: false,
          iss: false,
          sub: false,
          nbf: true,
          exp: true,
          maxAgeSec: ONE_HOUR,
          timeSkewSec: 15
        },
        validate: (
          /** @type {{ decoded: { payload: CognitoAccessTokenPayload } }} */ artifacts,
          _request,
          h
        ) => {
          const { client_id: tokenClientId, token_use: tokenUse } =
            artifacts.decoded.payload

          if (tokenUse !== EXPECTED_TOKEN_USE) {
            return { isValid: false }
          }

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
            credentials: { id: clientId, isMachine: true, name: 'RPD' }
          }
        }
      })
    }
  }
}
