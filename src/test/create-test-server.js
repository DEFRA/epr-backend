import { createServer } from '#server/server.js'
import { vi } from 'vitest'
import { tier2OrgAccessPlugin } from './tier2-org-access-plugin.js'

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
 * @typedef {import('#common/helpers/auth/auth-context-adapter.js').AuthContextAdapter} AuthContextAdapter
 */

/**
 * @param {{
 *   repositories?: object,
 *   featureFlags?: object,
 *   authContext?: AuthContextAdapter,
 *   [key: string]: unknown
 * }} [options]
 * @returns {Promise<TestServer>}
 */
export async function createTestServer(options = {}) {
  const { authContext, ...serverOptions } = options

  // If repositories are provided, assume in-memory mode and skip MongoDB
  const skipMongoDb = serverOptions.repositories !== undefined

  // If authContext provided, skip production org-access-plugin (use Tier 2 test plugin instead)
  const skipOrgAccessPlugin = authContext !== undefined

  const server = await createServer({
    skipMongoDb,
    skipOrgAccessPlugin,
    ...serverOptions
  })

  // Register Tier 2 test plugin for cross-org access testing with in-memory adapter
  if (authContext) {
    await server.register({
      plugin: tier2OrgAccessPlugin,
      options: { authContext }
    })
  }

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
