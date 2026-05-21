import { createHash, timingSafeEqual } from 'node:crypto'
import Boom from '@hapi/boom'
import { SCOPES } from '#common/helpers/auth/constants.js'

/**
 * @param {string} s
 */
const hashBuffer = (s) => createHash('sha256').update(s).digest()

/**
 * @param {string} a
 * @param {string} b
 */
const safeEqual = (a, b) => timingSafeEqual(hashBuffer(a), hashBuffer(b))

/**
 * @typedef {import('convict').Config<{basicAuth: {username: string, password: string}}>} BasicAuthConfig
 */

/**
 * @typedef {{username: String, password: string}} BasicAuthOptions
 */

const SCHEME_NAME = 'basic'
export const STRATEGY_NAME = 'basic-auth'

export const basicAuthPlugin = {
  plugin: {
    name: 'basic-auth-plugin',
    version: '1.0.0',
    /**
     * @param {import('@hapi/hapi').Server} server
     * @param {{ config: BasicAuthConfig }} options
     */
    register: (server, { config }) => {
      server.auth.scheme(
        SCHEME_NAME,
        (_server, /** @type {BasicAuthOptions | undefined} */ options) => {
          const basicAuthConfigured = options?.username && options?.password

          if (!basicAuthConfigured) {
            server.logger.warn(
              'Basic Auth strategy registered without credentials - it will reject all requests'
            )
            return {
              authenticate: (_request, h) => {
                return h.unauthenticated(Boom.unauthorized(null, 'Basic'))
              }
            }
          }

          return {
            authenticate: (request, h) => {
              const authorization = request.headers.authorization

              if (
                typeof authorization !== 'string' ||
                !authorization.startsWith('Basic ')
              ) {
                return h.unauthenticated(Boom.unauthorized(null, 'Basic'))
              }

              const decoded = Buffer.from(
                authorization.replace('Basic ', ''),
                'base64'
              ).toString('utf-8')
              const colonIndex = decoded.indexOf(':')

              if (colonIndex === -1) {
                return h.unauthenticated(Boom.unauthorized(null, 'Basic'))
              }

              const username = decoded.slice(0, colonIndex)
              const password = decoded.slice(colonIndex + 1)

              if (
                !safeEqual(username, options.username) ||
                !safeEqual(password, options.password)
              ) {
                return h.unauthenticated(Boom.unauthorized(null, 'Basic'))
              }

              return h.authenticated({
                credentials: {
                  id: username,
                  name: username,
                  isMachine: true, // ensures user is identified appropriately in any audit logs
                  scope: [SCOPES.organisationRead]
                }
              })
            }
          }
        }
      )

      server.auth.strategy(STRATEGY_NAME, SCHEME_NAME, {
        username: config.get('basicAuth.username'),
        password: config.get('basicAuth.password')
      })
    }
  }
}
