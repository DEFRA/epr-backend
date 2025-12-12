import Hapi from '@hapi/hapi'
import Jwt from '@hapi/jwt'

import { secureContext } from '@defra/hapi-secure-context'

import { failAction } from '#common/helpers/fail-action.js'
import { requestLogger } from '#common/helpers/logging/request-logger.js'
import { mongoDbPlugin } from '#common/helpers/plugins/mongo-db-plugin.js'
import { setupProxy } from '#common/helpers/proxy/setup-proxy.js'
import { pulse } from '#common/helpers/pulse.js'
import { requestTracing } from '#common/helpers/request-tracing.js'
import { authPlugin } from '#plugins/auth/auth-plugin.js'
import { orgAccessPlugin } from '#plugins/auth/org-access-plugin.js'
import { cacheControl } from '#plugins/cache-control.js'
import { featureFlags } from '#plugins/feature-flags.js'
import { repositories } from '#plugins/repositories.js'
import { router } from '#plugins/router.js'
import { workers } from '#plugins/workers.js'
import { getConfig } from '#root/config.js'
import { logFilesUploadedFromForms } from '#server/log-form-file-uploads.js'
import { runFormsDataMigration } from '#server/run-forms-data-migration.js'

/**
 * Build the list of Hapi plugins based on configuration and options.
 *
 * Plugins:
 * - requestLogger   - automatically logs incoming requests
 * - requestTracing  - trace header logging and propagation
 * - cacheControl    - adds Cache-Control headers to prevent caching
 * - secureContext   - loads CA certificates from environment config
 * - pulse           - provides shutdown handlers
 * - mongoDb         - sets up mongo connection pool and attaches to `server` and `request` objects
 * - repositories    - sets up repository adapters and attaches to `request` objects
 * - featureFlags    - sets up feature flag adapter and attaches to `request` objects
 * - workers         - sets up worker thread pools and attaches to `request` objects
 * - router          - routes used in the app
 * - Jwt             - JWT authentication plugin
 * - authPlugin      - sets up authentication strategies
 * - orgAccessPlugin - enforces organisation access control (403 for org mismatch/status)
 *
 * @param {object} options - Server creation options
 * @param {object} config - Application configuration
 * @returns {Array} Array of Hapi plugins to register
 */
function buildPlugins(options, config) {
  const plugins = [
    requestLogger,
    requestTracing,
    cacheControl,
    secureContext,
    pulse,
    Jwt,
    authPlugin
  ]

  // Register org access plugin for production mode unless tests want to use their own
  if (!options.skipOrgAccessPlugin) {
    plugins.push({
      plugin: orgAccessPlugin,
      options: {}
    })
  }

  // Only register MongoDB plugin if not explicitly skipped (e.g., for in-memory tests)
  if (!options.skipMongoDb) {
    plugins.push({
      plugin: mongoDbPlugin,
      options: config.get('mongo')
    })
  }

  plugins.push(
    {
      plugin: repositories,
      options: {
        ...options.repositories,
        skipMongoDb: options.skipMongoDb,
        eventualConsistency: config.get('mongo.eventualConsistency')
      }
    },
    {
      plugin: featureFlags,
      options: {
        config,
        featureFlags: options.featureFlags
      }
    },
    {
      plugin: workers,
      options: options.workers
    },
    router
  )

  return plugins
}

async function createServer(options = {}) {
  setupProxy()
  const config = getConfig()
  const server = Hapi.server({
    host: config.get('host'),
    port: config.get('port'),
    debug: config.get('debug'),
    routes: {
      validate: {
        options: {
          abortEarly: false
        },
        failAction
      },
      security: {
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: false
        },
        xss: 'enabled',
        noSniff: true,
        xframe: true
      }
    },
    router: {
      stripTrailingSlash: true
    }
  })

  const plugins = buildPlugins(options, config)
  await server.register(plugins)

  server.ext('onPostStart', () => {
    logFilesUploadedFromForms(server, options)
    runFormsDataMigration(server, {
      shouldTruncateEprOrganisations: config.get('truncateEprOrganisations')
    })
  })

  return server
}

export { createServer }
