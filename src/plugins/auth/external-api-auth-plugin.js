/** @import { CognitoAccessTokenPayload } from '#common/helpers/auth/types.js' */

import { StatusCodes } from 'http-status-codes'

const EXPECTED_SCOPE = 'epr-backend-resource-srv/access'
const EXPECTED_TOKEN_USE = 'access'

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
        keys: { key: 'not-verified', algorithms: ['RS256'] },
        verify: false,
        validate: (
          /** @type {{ decoded: { payload: CognitoAccessTokenPayload } }} */ artifacts,
          _request,
          h
        ) => {
          const {
            client_id: tokenClientId,
            exp,
            scope,
            token_use: tokenUse
          } = artifacts.decoded.payload

          if (tokenUse !== EXPECTED_TOKEN_USE) {
            return { isValid: false }
          }

          if (!scope?.includes(EXPECTED_SCOPE)) {
            return { isValid: false }
          }

          if (!exp || exp <= Math.floor(Date.now() / 1000)) {
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
