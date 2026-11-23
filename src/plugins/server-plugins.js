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
 * @param {ReturnType<typeof import('#root/config.js').getConfig>} config
 * @param {any[]} infrastructure - the repository and worker plugins, and the
 *   plugins that depend on repositories, which the legacy apply-routes server
 *   registers none of
 * @returns {any[]} untyped, because Hapi's typings for `server.register`
 *   accept no array that mixes bare and wrapped plugins
 */
export function serverPlugins(config, infrastructure) {
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
