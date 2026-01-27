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
import { mongoOrganisationsRepositoryPlugin } from '#plugins/repositories/mongo-organisations-repository-plugin.js'
import { mongoSummaryLogsRepositoryPlugin } from '#plugins/repositories/mongo-summary-logs-repository-plugin.js'
import { mongoFormSubmissionsRepositoryPlugin } from '#plugins/repositories/mongo-form-submissions-repository-plugin.js'
import { mongoWasteRecordsRepositoryPlugin } from '#plugins/repositories/mongo-waste-records-repository-plugin.js'
import { mongoWasteBalancesRepositoryPlugin } from '#plugins/repositories/mongo-waste-balances-repository-plugin.js'
import { mongoSystemLogsRepositoryPlugin } from '#plugins/repositories/mongo-system-logs-repository-plugin.js'
import { s3UploadsRepositoryPlugin } from '#plugins/repositories/s3-uploads-repository-plugin.js'
import { s3PublicRegisterRepositoryPlugin } from '#plugins/repositories/s3-public-register-repository-plugin.js'
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
  // mongo*Plugin   - individual repository plugins (ADR 0026 adapter pattern)
  // s3*Plugin      - S3 repository plugins
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
    })
  }

  plugins.push({
    plugin: featureFlags,
    options: {
      config,
      featureFlags: options.featureFlags
    }
  })

  // LEGACY: Skip MongoDB for tests of /v1/apply/* routes that bypass repositories.
  // These routes use raw db.collection() access and need refactoring.
  // Once refactored, delete this flag and the server-with-mock-db.js fixture.
  // See: src/routes/v1/apply/*.js
  if (!options._testOnlyLegacyApplyRoutes) {
    // MongoDB connection - required for production
    plugins.push({
      plugin: mongoDbPlugin,
      options: config.get('mongo')
    })

    // Repository plugins - explicit composition, no conditional logic
    const eventualConsistency = config.get('mongo.eventualConsistency')
    plugins.push(
      {
        plugin: mongoOrganisationsRepositoryPlugin,
        options: { eventualConsistency }
      },
      mongoSummaryLogsRepositoryPlugin,
      mongoFormSubmissionsRepositoryPlugin,
      mongoWasteRecordsRepositoryPlugin,
      {
        plugin: mongoWasteBalancesRepositoryPlugin,
        options: { eventualConsistency }
      },
      mongoSystemLogsRepositoryPlugin,
      s3UploadsRepositoryPlugin,
      s3PublicRegisterRepositoryPlugin
    )
  }

  plugins.push(
    {
      plugin: workers,
      options: options.workers
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
