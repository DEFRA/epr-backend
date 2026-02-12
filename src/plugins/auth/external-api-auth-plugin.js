/** @import { CognitoAccessTokenPayload } from '#common/helpers/auth/types.js' */

import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'

const EXPECTED_SCOPE = 'epr-backend-resource-srv/access'
const EXPECTED_TOKEN_USE = 'access'

const tokenSchema = Joi.object({
  token_use: Joi.string().valid(EXPECTED_TOKEN_USE).required(),
  scope: Joi.string()
    .custom((value, helpers) =>
      value.includes(EXPECTED_SCOPE) ? value : helpers.error('any.invalid')
    )
    .required(),
  exp: Joi.number().greater(Joi.ref('$now')).required(),
  client_id: Joi.string().required()
}).unknown(true)

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
          const { error } = tokenSchema.validate(artifacts.decoded.payload, {
            context: { now: Math.floor(Date.now() / 1000) }
          })

          if (error) {
            return { isValid: false }
          }

          const { client_id: tokenClientId } = artifacts.decoded.payload

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
