import Hapi from '@hapi/hapi'
import Inert from '@hapi/inert'
import Vision from '@hapi/vision'
import HapiSwagger from 'hapi-swagger'
import Jwt from '@hapi/jwt'

import { secureContext } from '@defra/hapi-secure-context'

import { failAction } from '#common/helpers/fail-action.js'
import { requestLogger } from '#common/helpers/logging/request-logger.js'
import { mongoDbPlugin } from '#common/helpers/plugins/mongo-db-plugin.js'
import { setupProxy } from '#common/helpers/proxy/setup-proxy.js'
import { pulse } from '#common/helpers/pulse.js'
import { requestTracing } from '#common/helpers/request-tracing.js'
import { authFailureLogger } from '#plugins/auth-failure-logger.js'
import { authPlugin } from '#plugins/auth/auth-plugin.js'
import { cacheControl } from '#plugins/cache-control.js'
import { featureFlags } from '#plugins/feature-flags.js'
import { repositories } from '#plugins/repositories.js'
import { router } from '#plugins/router.js'
import { workers } from '#plugins/workers.js'
import { getConfig } from '#root/config.js'
import { logFilesUploadedFromForms } from '#server/log-form-file-uploads.js'
import { runFormsDataMigration } from '#server/run-forms-data-migration.js'
import { runGlassMigration } from '#server/run-glass-migration.js'

function getServerConfig(config) {
  return {
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
        xss: /** @type {'enabled'} */ ('enabled'),
        noSniff: true,
        xframe: /** @type {true} */ (true)
      }
    },
    router: {
      stripTrailingSlash: true
    }
  }
}

async function createServer(options = {}) {
  setupProxy()
  const config = getConfig()
  const server = Hapi.server(getServerConfig(config))

  // Hapi Plugins:
  // requestLogger  - automatically logs incoming requests
  // requestTracing - trace header logging and propagation
  // cacheControl   - adds Cache-Control headers to prevent caching
  // secureContext  - loads CA certificates from environment config
  // pulse          - provides shutdown handlers
  // mongoDb        - sets up mongo connection pool and attaches to `server` and `request` objects
  // repositories   - sets up repository adapters and attaches to `request` objects
  // featureFlags   - sets up feature flag adapter and attaches to `request` objects
  // workers        - sets up worker thread pools and attaches to `request` objects
  // router         - routes used in the app
  // Jwt            - JWT authentication plugin
  // authPlugin     - sets up authentication strategies
  // authFailureLogger - logs 401 authentication failures
  const plugins = [
    requestLogger,
    requestTracing,
    cacheControl,
    secureContext,
    pulse,
    Jwt,
    authPlugin,
    authFailureLogger
  ]

  /* istanbul ignore next */
  if (config.get('isSwaggerEnabled')) {
    plugins.push(Inert, Vision, {
      plugin: HapiSwagger,
      options: {
        info: {
          title: 'API Documentation',
          version: '1'
        },
        documentationPath: '/swagger'
      }
    })
  }

  plugins.push({
    plugin: featureFlags,
    options: {
      config,
      featureFlags: options.featureFlags
    }
  })

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
      plugin: workers,
      options: {
        ...options.workers,
        // When skipping MongoDB, pass the test repository to workers plugin
        // If no repository provided, use a stub that does nothing (for tests that don't use summary logs)
        ...(options.skipMongoDb && {
          summaryLogsRepository: options.repositories?.summaryLogsRepository
            ? options.repositories.summaryLogsRepository(server.logger)
            : /* v8 ignore next */ {
                findById: async () => null,
                update: async () => {}
              }
        })
      }
    },
    router
  )

  await server.register(plugins)

  server.ext('onPostStart', () => {
    logFilesUploadedFromForms(server, options)
    runFormsDataMigration(server, {
      shouldTruncateEprOrganisations: config.get('truncateEprOrganisations')
    })
    runGlassMigration(server)
  })

  return server
}

export { createServer }
