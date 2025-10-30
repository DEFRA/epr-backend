// eslint-disable-next-line n/no-unpublished-import
import { test, vi } from 'vitest'

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
 * Fast test fixture for legacy apply routes.
 * Creates a server without MongoDB but provides a mock db object for spying.
 *
 * This is a temporary fixture for legacy apply routes that directly use MongoDB
 * instead of repositories. Once these routes are refactored to use repositories,
 * delete this file and use createTestServer() with in-memory repositories instead.
 *
 * ~10x faster than testServerFixture because it skips MongoDB startup.
 */
export const applyRouteTest = test.extend(
  {
    // eslint-disable-next-line no-empty-pattern
    testServer: async ({}, use) => {
      const { createServer } = await import('#server/server.js')
      const server = await createServer({ skipMongoDb: true })

      // Add a mock db object that can be spied on
      // This allows tests to do: vi.spyOn(testServer.db, 'collection')
      const mockDb = {
        collection: vi.fn()
      }

      server.decorate('server', 'db', mockDb)
      server.decorate('request', 'db', mockDb)

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

      await use(testServer)

      await server.stop()
    }
  },
  { scope: 'file' }
)

// eslint-disable-next-line n/no-unpublished-import
export { expect, describe, beforeEach, afterEach, vi } from 'vitest'
