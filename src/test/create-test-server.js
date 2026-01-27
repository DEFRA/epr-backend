import Hapi from '@hapi/hapi'
import Jwt from '@hapi/jwt'
import { vi } from 'vitest'

import { secureContext } from '@defra/hapi-secure-context'

import { failAction } from '#common/helpers/fail-action.js'
import { requestLogger } from '#common/helpers/logging/request-logger.js'
import { pulse } from '#common/helpers/pulse.js'
import { requestTracing } from '#common/helpers/request-tracing.js'
import { authFailureLogger } from '#plugins/auth-failure-logger.js'
import { authPlugin } from '#plugins/auth/auth-plugin.js'
import { cacheControl } from '#plugins/cache-control.js'
import { featureFlags as featureFlagsPlugin } from '#plugins/feature-flags.js'
import { mockWorkersPlugin } from '#plugins/mock-workers-plugin.js'
import { router } from '#plugins/router.js'
import { registerRepository } from '#plugins/repositories/register-repository.js'
import { getConfig } from '#root/config.js'

import { createInMemoryOrganisationsRepositoryPlugin } from '#plugins/repositories/inmemory-organisations-repository-plugin.js'
import { createInMemorySummaryLogsRepositoryPlugin } from '#plugins/repositories/inmemory-summary-logs-repository-plugin.js'
import { createInMemoryFormSubmissionsRepositoryPlugin } from '#plugins/repositories/inmemory-form-submissions-repository-plugin.js'
import { createInMemoryWasteRecordsRepositoryPlugin } from '#plugins/repositories/inmemory-waste-records-repository-plugin.js'
import { createInMemoryWasteBalancesRepositoryPlugin } from '#plugins/repositories/inmemory-waste-balances-repository-plugin.js'
import { createInMemorySystemLogsRepositoryPlugin } from '#plugins/repositories/inmemory-system-logs-repository-plugin.js'
import { createInMemoryUploadsRepositoryPlugin } from '#plugins/repositories/inmemory-uploads-repository-plugin.js'
import { createInMemoryPublicRegisterRepositoryPlugin } from '#plugins/repositories/inmemory-public-register-repository-plugin.js'

/**
 * @typedef {import('#common/hapi-types.js').HapiServer & {
 *   loggerMocks: {
 *     info: ReturnType<typeof vi.fn>
 *     error: ReturnType<typeof vi.fn>
 *     warn: ReturnType<typeof vi.fn>
 *   }
 * }} TestServer
 */

/**
 * @typedef {Object} CreateTestServerOptions
 * @property {Object} [featureFlags] - Optional feature flags override
 * @property {Object} [repositories] - Optional repository overrides (for mocks or custom instances)
 * @property {Object} [workers] - Optional worker overrides (passed to mockWorkersPlugin)
 */

/**
 * Creates a plugin that wraps a repository for request access.
 * Supports both factory functions (old pattern) and direct instances (new pattern).
 *
 * @param {string} name - Repository name
 * @param {Function|Object} repositoryOrFactory - Repository instance OR factory function
 * @returns {import('@hapi/hapi').Plugin<void>}
 */
function createRepositoryPlugin(name, repositoryOrFactory) {
  const isFactory = typeof repositoryOrFactory === 'function'

  return {
    name,
    register: (server) => {
      registerRepository(server, name, (request) => {
        if (isFactory) {
          // Old pattern: factory function that takes logger
          return repositoryOrFactory(request.logger)
        }
        // New pattern: direct instance
        return repositoryOrFactory
      })
    }
  }
}

/**
 * Creates a test server with in-memory repositories.
 * Accepts optional overrides for repositories and workers.
 *
 * @param {CreateTestServerOptions} [options]
 * @returns {Promise<TestServer>}
 */
export async function createTestServer(options = {}) {
  const config = getConfig()
  const repoOverrides = options.repositories ?? {}

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
        xss: /** @type {'enabled'} */ ('enabled'),
        noSniff: true,
        xframe: /** @type {true} */ (true)
      }
    },
    router: {
      stripTrailingSlash: true
    }
  })

  // Core plugins needed for testing
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

  // Feature flags - use provided override or config-based
  plugins.push({
    plugin: featureFlagsPlugin,
    options: {
      config,
      featureFlags: options.featureFlags
    }
  })

  // Repository plugins - use override if provided, otherwise default in-memory
  const repositoryConfigs = [
    {
      name: 'organisationsRepository',
      createDefault: createInMemoryOrganisationsRepositoryPlugin
    },
    {
      name: 'summaryLogsRepository',
      createDefault: createInMemorySummaryLogsRepositoryPlugin
    },
    {
      name: 'formSubmissionsRepository',
      createDefault: createInMemoryFormSubmissionsRepositoryPlugin
    },
    {
      name: 'wasteRecordsRepository',
      createDefault: createInMemoryWasteRecordsRepositoryPlugin
    },
    {
      name: 'wasteBalancesRepository',
      createDefault: createInMemoryWasteBalancesRepositoryPlugin
    },
    {
      name: 'systemLogsRepository',
      createDefault: createInMemorySystemLogsRepositoryPlugin
    },
    {
      name: 'uploadsRepository',
      createDefault: createInMemoryUploadsRepositoryPlugin
    },
    {
      name: 'publicRegisterRepository',
      createDefault: createInMemoryPublicRegisterRepositoryPlugin
    }
  ]

  for (const { name, createDefault } of repositoryConfigs) {
    if (repoOverrides[name]) {
      // Use provided override - wrap in plugin
      plugins.push(createRepositoryPlugin(name, repoOverrides[name]))
    } else {
      // Use default in-memory plugin
      const { plugin } = createDefault()
      plugins.push(plugin)
    }
  }

  // Mock workers plugin - pass any worker overrides
  plugins.push({
    plugin: mockWorkersPlugin,
    options: options.workers
  })

  // Router (routes)
  plugins.push(router)

  await server.register(plugins)
  await server.initialize()

  /** @type {TestServer} */
  const testServer = /** @type {*} */ (server)

  testServer.loggerMocks = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }

  testServer.ext('onRequest', (request, h) => {
    vi.spyOn(request.logger, 'info').mockImplementation(
      testServer.loggerMocks.info
    )
    vi.spyOn(request.logger, 'error').mockImplementation(
      testServer.loggerMocks.error
    )
    vi.spyOn(request.logger, 'warn').mockImplementation(
      testServer.loggerMocks.warn
    )
    return h.continue
  })

  return testServer
}
