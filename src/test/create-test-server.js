import Hapi from '@hapi/hapi'
import { vi } from 'vitest'

import { mockSqsCommandExecutorPlugin } from '#adapters/sqs-command-executor/mock.plugin.js'
import { mockDlqAdminPlugin } from '#plugins/dlq-admin.mock.plugin.js'
import { failAction } from '#common/helpers/fail-action.js'
import { modulePlugins } from '#plugins/modules.js'
import { registerDependency } from '#plugins/register-dependency.js'
import { serverPlugins } from '#plugins/server-plugins.js'
import { getConfig } from '#root/config.js'
import { createMockExternalAccreditationsRepository } from '#test/mock-repositories.js'

import { createInMemoryPublicRegisterRepositoryPlugin } from '#public-register/test-support.js'
import { createInMemoryUploadsRepositoryPlugin } from '#adapters/repositories/uploads/inmemory.plugin.js'
import { createInMemoryNonProdDataResetPlugin } from '#non-prod-data-reset/inmemory.plugin.js'
import { createInMemoryOverseasSitesRepositoryPlugin } from '#overseas-sites/index.js'
import { createInMemoryOrsImportsRepositoryPlugin } from '#overseas-sites/imports/repository/inmemory.js'
import { createInMemoryOrganisationReadRepository } from '#organisation-read-model/test-support.js'
import { createInMemoryPackagingRecyclingNotesRepositoryPlugin } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { createInMemoryReportsRepositoryPlugin } from '#reports/repository/inmemory.plugin.js'
import { createInMemoryRegistrationAccreditationAdminRepository } from '#registration-accreditation-admin/test-support.js'
import { prnEventsPlugin } from '#packaging-recycling-notes/application/prn-events.plugin.js'
import { createInMemoryFormSubmissionsRepositoryPlugin } from '#repositories/form-submissions/inmemory.plugin.js'
import { createInMemoryOrganisationsRepositoryPlugin } from '#repositories/organisations/inmemory.plugin.js'
import { createInMemorySummaryLogsRepositoryPlugin } from '#repositories/summary-logs/inmemory.plugin.js'
import { createInMemorySystemLogsRepositoryPlugin } from '#repositories/system-logs/inmemory.plugin.js'
import { createInMemoryWasteBalanceServicePlugin } from '#waste-balances/repository/inmemory.plugin.js'
import { createInMemoryLedgerRepositoryPlugin } from '#waste-balances/repository/ledger-inmemory.plugin.js'
import { createInMemorySummaryLogRowStatesRepositoryPlugin } from '#waste-records/repository/inmemory.plugin.js'

/** @import { Lifecycle, Plugin } from '@hapi/hapi' */
/** @import { Db } from 'mongodb' */
/** @import { HapiServer, ServerApp } from '#common/hapi-types.js' */
/** @import { LogMethod } from '#common/helpers/logging/logger.js' */
/** @import { Mock } from 'vitest' */
/** @import { ModuleOptions } from '#plugins/modules.js' */

/**
 * @typedef {import('#common/hapi-types.js').HapiServer & {
 *   loggerMocks: {
 *     info: Mock<LogMethod>
 *     error: Mock<LogMethod>
 *     warn: Mock<LogMethod>
 *   }
 * }} TestServer
 */

/**
 * @typedef {{
 *   config?: Record<string, any>
 *   db?: Db
 *   repositories?: object
 *   workers?: object
 *   dlqService?: import('#plugins/dlq-admin.js').DlqService
 * }} CreateTestServerOptions
 */

/**
 * Resolves a repository override for a request: a factory is called with the
 * request's logger, an instance is returned as it is.
 *
 * @param {Function|Object} repositoryOrFactory - Repository instance OR factory function
 * @returns {(request: {logger: import('#common/hapi-types.js').TypedLogger}) => any}
 */
const resolveOverride = (repositoryOrFactory) => (request) =>
  typeof repositoryOrFactory === 'function'
    ? repositoryOrFactory(request.logger)
    : repositoryOrFactory

/**
 * Creates a plugin that wraps a repository for request access.
 * Supports both factory functions (per-request instantiation) and direct instances.
 *
 * @param {keyof ServerApp} name - Repository name
 * @param {Function|Object} repositoryOrFactory - Repository instance OR factory function
 * @returns {import('@hapi/hapi').Plugin<void>}
 */
function createRepositoryPlugin(name, repositoryOrFactory) {
  return {
    name,
    register: (server) => {
      registerDependency(server, name, resolveOverride(repositoryOrFactory))
    }
  }
}

/**
 * Serves one organisations store through both of its ports, so a test that
 * seeds organisations through one port reads them through the other.
 *
 * @param {Function|Object} repositoryOrFactory - Repository instance OR factory function
 * @returns {import('@hapi/hapi').Plugin<void>}
 */
function createOrganisationsRepositoryPlugin(repositoryOrFactory) {
  return {
    name: 'organisationsRepository',
    register: (server) => {
      registerDependency(
        server,
        'organisationAdministrationRepository',
        resolveOverride(repositoryOrFactory)
      )
      registerDependency(
        server,
        'organisationLinkingRepository',
        resolveOverride(repositoryOrFactory)
      )
    }
  }
}

/**
 * Serves the registration and accreditation admin repository over whichever
 * organisations repository the test server holds, so a test that seeds
 * organisations through that repository reaches them through the admin routes.
 */
const createInMemoryRegistrationAccreditationAdminRepositoryPlugin = () => ({
  name: 'registrationAccreditationAdminRepository',
  dependencies: ['organisationsRepository'],
  /** @param {import('@hapi/hapi').Server & HapiServer} server */
  register: (server) => {
    const createRepository =
      createInMemoryRegistrationAccreditationAdminRepository(
        server.app.organisationAdministrationRepository
      )
    registerDependency(server, 'registrationAccreditationAdminRepository', () =>
      createRepository()
    )
  }
})

/**
 * Decorates `server` and `request` with a real Mongo `Db`, for route tests that
 * exercise raw `request.db` access instead of a repository.
 *
 * @param {Db} db
 * @returns {Plugin<void>}
 */
const createDbPlugin = (db) => ({
  name: 'test-db',
  register: (server) => {
    server.decorate('server', 'db', db)
    server.decorate('request', 'db', db)
  }
})

/**
 * @typedef {{
 *   name: keyof ServerApp,
 *   createDefault: Function,
 *   createOverride?: (repositoryOrFactory: Function|Object) => import('@hapi/hapi').Plugin<void>
 * }} RepositoryConfig
 */

/** @type {RepositoryConfig[]} */
const repositoryConfigs = [
  {
    name: 'organisationAdministrationRepository',
    createDefault: createInMemoryOrganisationsRepositoryPlugin,
    createOverride: createOrganisationsRepositoryPlugin
  },
  {
    name: 'registrationAccreditationAdminRepository',
    createDefault: createInMemoryRegistrationAccreditationAdminRepositoryPlugin
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
    name: 'summaryLogRowStatesRepository',
    createDefault: createInMemorySummaryLogRowStatesRepositoryPlugin
  },
  {
    name: 'ledgerRepository',
    createDefault: createInMemoryLedgerRepositoryPlugin
  },
  {
    name: 'wasteBalanceService',
    createDefault: createInMemoryWasteBalanceServicePlugin
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
    name: 'packagingRecyclingNotesRepository',
    createDefault: createInMemoryPackagingRecyclingNotesRepositoryPlugin
  },
  {
    name: 'reportsRepository',
    createDefault: createInMemoryReportsRepositoryPlugin
  },
  {
    name: 'overseasSitesRepository',
    createDefault: createInMemoryOverseasSitesRepositoryPlugin
  },
  {
    name: 'orsImportsRepository',
    createDefault: createInMemoryOrsImportsRepositoryPlugin
  }
]

/** @type {RepositoryConfig[]} */
const devEndpointsRepositoryConfigs = [
  {
    name: 'nonProdDataReset',
    createDefault: createInMemoryNonProdDataResetPlugin
  },
  {
    name: 'externalAccreditationsRepository',
    createDefault: () =>
      createRepositoryPlugin(
        'externalAccreditationsRepository',
        createMockExternalAccreditationsRepository()
      )
  }
]

/**
 * Builds repository plugins from config, applying any overrides.
 * @param {RepositoryConfig[]} configs - Repository configurations
 * @param {Partial<Record<keyof ServerApp, Function|Object>>} repoOverrides - Repository overrides keyed by name
 * @returns {import('@hapi/hapi').Plugin<void>[]}
 */
function buildRepositoryPlugins(configs, repoOverrides) {
  return configs.map(({ name, createDefault, createOverride }) => {
    if (!repoOverrides[name]) {
      return createDefault()
    }
    return createOverride
      ? createOverride(repoOverrides[name])
      : createRepositoryPlugin(name, repoOverrides[name])
  })
}

/**
 * Gives each module the in-memory adapter for its port, or the test's own
 * repository where the test passes one.
 *
 * @param {Partial<Record<keyof ServerApp, Function|Object>>} repoOverrides - Repository overrides keyed by name
 * @returns {Required<ModuleOptions>}
 */
const testModuleOptions = (repoOverrides) => ({
  'organisation-read-model': {
    organisationReadRepository: repoOverrides.organisationReadRepository
      ? resolveOverride(repoOverrides.organisationReadRepository)
      : createInMemoryOrganisationReadRepository()
  }
})

/**
 * Creates a Hapi server with test configuration.
 * @param {import('convict').Config<Record<string, any>>} config
 * @returns {import('@hapi/hapi').Server}
 */
function createHapiServer(config) {
  return Hapi.server({
    host: config.get('host'),
    port: config.get('port'),
    debug: config.get('debug'),
    routes: {
      validate: {
        options: { abortEarly: false },
        failAction: /** @type {Lifecycle.FailAction} */ (
          /** @type {unknown} */ (failAction)
        )
      },
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
 * Spies both the singleton `server.logger` (eagerly, so onRequest-time logs
 * from earlier-registered extensions are captured) and per-request
 * `request.logger` (via onRequest extension).
 * @param {TestServer} testServer
 */
function attachLoggerMocks(testServer) {
  testServer.loggerMocks = {
    info: /** @type {Mock<LogMethod>} */ (vi.fn()),
    error: /** @type {Mock<LogMethod>} */ (vi.fn()),
    warn: /** @type {Mock<LogMethod>} */ (vi.fn())
  }

  vi.spyOn(testServer.logger, 'info').mockImplementation(
    testServer.loggerMocks.info
  )
  vi.spyOn(testServer.logger, 'error').mockImplementation(
    testServer.loggerMocks.error
  )
  vi.spyOn(testServer.logger, 'warn').mockImplementation(
    testServer.loggerMocks.warn
  )

  testServer.ext('onRequest', (request, h) => {
    vi.spyOn(request.logger, 'info').mockImplementation(
      /** @type {(...args: unknown[]) => void} */ (testServer.loggerMocks.info)
    )
    vi.spyOn(request.logger, 'error').mockImplementation(
      /** @type {(...args: unknown[]) => void} */ (testServer.loggerMocks.error)
    )
    vi.spyOn(request.logger, 'warn').mockImplementation(
      /** @type {(...args: unknown[]) => void} */ (testServer.loggerMocks.warn)
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
  const config = getConfig(options.config ?? {})
  const server = createHapiServer(config)

  server.decorate('request', 'config', () => config, { apply: true })

  const infrastructure = [
    ...buildRepositoryPlugins(repositoryConfigs, options.repositories ?? {}),
    ...buildRepositoryPlugins(
      config.get('featureFlags.devEndpoints')
        ? devEndpointsRepositoryConfigs
        : [],
      options.repositories ?? {}
    ),
    prnEventsPlugin,
    { plugin: mockSqsCommandExecutorPlugin, options: options.workers },
    {
      plugin: mockDlqAdminPlugin,
      options: { dlqService: options.dlqService }
    },
    ...(options.db ? [createDbPlugin(options.db)] : []),
    ...modulePlugins(config, testModuleOptions(options.repositories ?? {}))
  ]

  await server.register(serverPlugins(config, infrastructure))
  await server.initialize()

  /** @type {TestServer} */
  const testServer = /** @type {*} */ (server)
  attachLoggerMocks(testServer)

  return testServer
}
