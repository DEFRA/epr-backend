import Hapi from '@hapi/hapi'
import Jwt from '@hapi/jwt'
import { vi } from 'vitest'

import { secureContext } from '@defra/hapi-secure-context'

import { mockSqsCommandExecutorPlugin } from '#adapters/sqs-command-executor/mock.plugin.js'
import { mockDlqAdminPlugin } from '#plugins/dlq-admin.mock.plugin.js'
import { failAction } from '#common/helpers/fail-action.js'
import { requestLogger } from '#common/helpers/logging/request-logger.js'
import { pulse } from '#common/helpers/pulse.js'
import { requestTracing } from '#common/helpers/request-tracing.js'
import { authFailureLogger } from '#plugins/auth-failure-logger.js'
import { boomErrorLogger } from '#plugins/boom-error-logger.js'
import { authPlugin } from '#plugins/auth/auth-plugin.js'
import { basicAuthPlugin } from '#plugins/auth/basic-auth-plugin.js'
import { externalApiAuthPlugin } from '#plugins/auth/external-api-auth-plugin.js'
import { uploadCallbackAuthPlugin } from '#plugins/auth/upload-callback-auth-plugin.js'
import { cacheControl } from '#plugins/cache-control.js'
import { externalApiErrorFormatter } from '#plugins/external-api-error-formatter.js'
import { registerDependency } from '#plugins/register-dependency.js'
import { getConfig } from '#root/config.js'

/** @import { Lifecycle, Plugin, Server, ServerRoute } from '@hapi/hapi' */
/** @import { HapiServer } from '#common/hapi-types.js' */
/** @import { Db } from 'mongodb' */
/** @import { ServerApp } from '#common/hapi-types.js' */
/** @import { LogMethod } from '#common/helpers/logging/logger.js' */
/** @import { Mock } from 'vitest' */

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
 *   routes?: (config: import('convict').Config<Record<string, any>>) => object[]
 *   plugins?: DependencyPlugin[]
 *   repositories?: object
 *   workers?: object
 *   dlqService?: import('#plugins/dlq-admin.js').DlqService
 * }} CreateTestServerOptions
 */

/**
 * A plugin that registers a dependency of the routes, such as a repository.
 * Some plugins need the server as its plugins have decorated it. A repository
 * override replaces the plugin whose name is the override's key, so a plugin
 * takes the name of the dependency it registers.
 *
 * @typedef {Plugin<void> | { name: string, register: (server: Server & HapiServer) => void }} DependencyPlugin
 */

/**
 * @param {DependencyPlugin} plugin
 * @returns {string}
 */
const pluginName = (plugin) =>
  'name' in plugin ? plugin.name : plugin.pkg.name

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
 * @returns {Plugin<void>}
 */
export function createRepositoryPlugin(name, repositoryOrFactory) {
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
 * @returns {Plugin<void>}
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
 * Registers each repository override the test gives in the place of the plugin
 * of the same name, because some plugins read another's dependency as they
 * register. An override with no plugin of its name registers last.
 * `organisationAdministrationRepository` overrides the organisations plugin,
 * which serves it through both of its ports.
 *
 * @param {DependencyPlugin[]} plugins
 * @param {Partial<Record<keyof ServerApp, Function|Object>>} repoOverrides - Repository overrides keyed by name
 * @returns {DependencyPlugin[]}
 */
function applyRepositoryOverrides(plugins, repoOverrides) {
  const overrides = Object.entries(repoOverrides)
    .filter(([, repositoryOrFactory]) => repositoryOrFactory)
    .map(([name, repositoryOrFactory]) =>
      name === 'organisationAdministrationRepository'
        ? createOrganisationsRepositoryPlugin(repositoryOrFactory)
        : createRepositoryPlugin(
            /** @type {keyof ServerApp} */ (name),
            repositoryOrFactory
          )
    )
  const overrideByName = new Map(
    overrides.map((override) => [pluginName(override), override])
  )
  const given = new Set(plugins.map(pluginName))
  return [
    ...plugins.map(
      (plugin) => overrideByName.get(pluginName(plugin)) ?? plugin
    ),
    ...overrides.filter((override) => !given.has(pluginName(override)))
  ]
}

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
 * Creates a test server serving only the routes the test gives it, with the
 * plugins those routes depend on, such as in-memory repositories.
 * Accepts optional overrides for repositories and workers.
 *
 * @param {CreateTestServerOptions} [options]
 * @returns {Promise<TestServer>}
 */
export async function createTestServer(options = {}) {
  const config = getConfig(options.config ?? {})
  const server = createHapiServer(config)

  server.decorate('request', 'config', () => config, { apply: true })

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
    externalApiErrorFormatter,
    ...applyRepositoryOverrides(
      options.plugins ?? [],
      options.repositories ?? {}
    ),
    { plugin: mockSqsCommandExecutorPlugin, options: options.workers },
    {
      plugin: mockDlqAdminPlugin,
      options: { dlqService: options.dlqService }
    },
    ...(options.db ? [createDbPlugin(options.db)] : [])
  ]

  await server.register(plugins)
  // Route modules declare plain objects, which hapi checks when they register.
  server.route(/** @type {ServerRoute[]} */ (options.routes?.(config) ?? []))
  await server.initialize()

  /** @type {TestServer} */
  const testServer = /** @type {*} */ (server)
  attachLoggerMocks(testServer)

  return testServer
}
