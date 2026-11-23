import Inert from '@hapi/inert'
import Jwt from '@hapi/jwt'
import Vision from '@hapi/vision'
import HapiSwagger from 'hapi-swagger'

import { secureContext } from '@defra/hapi-secure-context'

import { requestLogger } from '#common/helpers/logging/request-logger.js'
import { pulse } from '#common/helpers/pulse.js'
import { requestTracing } from '#common/helpers/request-tracing.js'
import { authFailureLogger } from '#plugins/auth-failure-logger.js'
import { authPlugin } from '#plugins/auth/auth-plugin.js'
import { basicAuthPlugin } from '#plugins/auth/basic-auth-plugin.js'
import { externalApiAuthPlugin } from '#plugins/auth/external-api-auth-plugin.js'
import { uploadCallbackAuthPlugin } from '#plugins/auth/upload-callback-auth-plugin.js'
import { boomErrorLogger } from '#plugins/boom-error-logger.js'
import { cacheControl } from '#plugins/cache-control.js'
import { externalApiErrorFormatter } from '#plugins/external-api-error-formatter.js'
import { router } from '#plugins/router.js'
import { wasteRecordsExport } from '#waste-records-export/plugin.js'

/* istanbul ignore next */
function getSwaggerPlugins() {
  return [
    Inert,
    Vision,
    {
      plugin: HapiSwagger,
      options: {
        info: {
          title: 'API Documentation',
          version: '1'
        },
        documentationPath: '/swagger',
        grouping: 'tags',
        tags: [{ name: 'admin', description: 'Admin UI endpoints' }],
        securityDefinitions: {
          Bearer: {
            type: 'apiKey',
            name: 'Authorization',
            in: 'header',
            description: 'Enter your Bearer token in the format: Bearer {token}'
          }
        },
        security: [{ Bearer: [] }]
      }
    }
  ]
}

/**
 * The plugins every server registers, around the infrastructure plugins that
 * differ between production and tests.
 *
 * @param {import('convict').Config<Record<string, any>>} config
 * Hapi's typings for `server.register` accept no array that mixes bare and
 * wrapped plugins, so the list is untyped.
 *
 * @param {any[]} infrastructure - the repository and worker plugins
 * @returns {any[]}
 */
export function serverPlugins(config, infrastructure) {
  // requestLogger  - automatically logs incoming requests
  // requestTracing - trace header logging and propagation
  // cacheControl   - adds Cache-Control headers to prevent caching
  // secureContext  - loads CA certificates from environment config
  // pulse          - provides shutdown handlers
  // Jwt            - JWT authentication plugin
  // authPlugin     - sets up authentication strategies
  // authFailureLogger - logs 401 authentication failures
  // boomErrorLogger    - logs other Boom errors with PII-safe ECS error fields
  // router         - routes used in the app
  // wasteRecordsExport - the waste records export module's routes
  const plugins = [
    requestLogger,
    requestTracing,
    cacheControl,
    secureContext,
    pulse,
    Jwt,
    authPlugin,
    {
      plugin: basicAuthPlugin.plugin,
      options: { config }
    },
    {
      plugin: externalApiAuthPlugin.plugin,
      options: { config }
    },
    uploadCallbackAuthPlugin,
    authFailureLogger,
    boomErrorLogger,
    externalApiErrorFormatter
  ]

  /* istanbul ignore next */
  if (config.get('isSwaggerEnabled')) {
    plugins.push(...getSwaggerPlugins())
  }

  return [
    ...plugins,
    ...infrastructure,
    { plugin: router, options: { config } },
    wasteRecordsExport
  ]
}
