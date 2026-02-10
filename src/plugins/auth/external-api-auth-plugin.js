import Boom from '@hapi/boom'
import Jwt from '@hapi/jwt'

/** @import { CognitoAccessTokenPayload } from '#common/helpers/auth/types.js' */

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

      server.auth.scheme('api-gateway-client-scheme', () => ({
        authenticate: (request, h) => {
          const authorization = request.headers.authorization
          if (!authorization) {
            throw Boom.unauthorized('Missing authorization header')
          }

          if (!authorization.startsWith('Bearer ')) {
            throw Boom.unauthorized('Invalid authorization scheme')
          }

          const token = authorization.slice('Bearer '.length)

          /** @type {{ decoded: { payload: CognitoAccessTokenPayload } }} */
          let decoded
          try {
            decoded = Jwt.token.decode(token)
          } catch {
            throw Boom.unauthorized('Invalid token')
          }

          const tokenClientId = decoded.decoded.payload.client_id
          if (!tokenClientId) {
            throw Boom.unauthorized('Missing client_id claim')
          }

          if (tokenClientId !== clientId) {
            throw Boom.forbidden('Unrecognised client')
          }

          return h.authenticated({
            credentials: {
              id: clientId,
              name: 'RPD',
              scope: ['external_client']
            }
          })
        }
      }))

      server.auth.strategy('api-gateway-client', 'api-gateway-client-scheme')
    }
  }
}
