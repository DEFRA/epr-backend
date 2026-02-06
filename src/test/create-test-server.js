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
import { mockWorkersPlugin } from '#adapters/validators/summary-logs/mock.plugin.js'
import { router } from '#plugins/router.js'
import { registerRepository } from '#plugins/register-repository.js'
import { getConfig } from '#root/config.js'

import { createInMemoryOrganisationsRepositoryPlugin } from '#repositories/organisations/inmemory.plugin.js'
import { createInMemorySummaryLogsRepositoryPlugin } from '#repositories/summary-logs/inmemory.plugin.js'
import { createInMemoryFormSubmissionsRepositoryPlugin } from '#repositories/form-submissions/inmemory.plugin.js'
import { createInMemoryWasteRecordsRepositoryPlugin } from '#repositories/waste-records/inmemory.plugin.js'
import { createInMemoryWasteBalancesRepositoryPlugin } from '#repositories/waste-balances/inmemory.plugin.js'
import { createInMemorySystemLogsRepositoryPlugin } from '#repositories/system-logs/inmemory.plugin.js'
import { createInMemoryUploadsRepositoryPlugin } from '#adapters/repositories/uploads/inmemory.plugin.js'
import { createInMemoryPublicRegisterRepositoryPlugin } from '#adapters/repositories/public-register/inmemory.plugin.js'
import { createInMemoryLumpyPackagingRecyclingNotesRepositoryPlugin } from '#packaging-recycling-notes/repository/inmemory.plugin.js'

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
 * Supports both factory functions (per-request instantiation) and direct instances.
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
          // Factory: call with logger (ignored if factory doesn't need it)
          return repositoryOrFactory(request.logger)
        }
        // Direct instance
        return repositoryOrFactory
      })
    }
  }
}

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
  },
  {
    name: 'lumpyPackagingRecyclingNotesRepository',
    createDefault: createInMemoryLumpyPackagingRecyclingNotesRepositoryPlugin
  }
]

/**
 * Builds repository plugins from config, applying any overrides.
 * @param {Object} repoOverrides - Repository overrides keyed by name
 * @returns {import('@hapi/hapi').Plugin<void>[]}
 */
function buildRepositoryPlugins(repoOverrides) {
  return repositoryConfigs.map(({ name, createDefault }) => {
    if (repoOverrides[name]) {
      return createRepositoryPlugin(name, repoOverrides[name])
    }
    return createDefault()
  })
}

/**
 * Creates a Hapi server with test configuration.
 * @param {ReturnType<typeof getConfig>} config
 * @returns {import('@hapi/hapi').Server}
 */
function createHapiServer(config) {
  return Hapi.server({
    host: config.get('host'),
    port: config.get('port'),
    debug: config.get('debug'),
    routes: {
      validate: { options: { abortEarly: false }, failAction },
      security: {
        hsts: { maxAge: 31536000, includeSubDomains: true, preload: false },
        xss: /** @type {'enabled'} */ ('enabled'),
        noSniff: true,
        xframe: /** @type {true} */ (true)
      }
    },
    router: { stripTrailingSlash: true }
  })
}

/**
 * Attaches logger mocks to the test server for assertion in tests.
 * @param {TestServer} testServer
 */
function attachLoggerMocks(testServer) {
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
  const server = createHapiServer(config)

  const plugins = [
    requestLogger,
    requestTracing,
    cacheControl,
    secureContext,
    pulse,
    Jwt,
    authPlugin,
    authFailureLogger,
    {
      plugin: featureFlagsPlugin,
      options: { config, featureFlags: options.featureFlags }
    },
    ...buildRepositoryPlugins(options.repositories ?? {}),
    { plugin: mockWorkersPlugin, options: options.workers },
    router
  ]

  await server.register(plugins)
  await server.initialize()

  /** @type {TestServer} */
  const testServer = /** @type {*} */ (server)
  attachLoggerMocks(testServer)

  return testServer
}
