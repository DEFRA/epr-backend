// eslint-disable-next-line n/no-unpublished-import
import { test, vi } from 'vitest'
import { createMockOidcServers } from '#test/helpers/mock-oidc.js'

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
export const it = test.extend({
  mockOidcServer: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const mockOidcServer = createMockOidcServers()
      mockOidcServer.listen({ onUnhandledRequest: 'warn' })

      await use(mockOidcServer)

      mockOidcServer.resetHandlers()
      mockOidcServer.close()
    },
    { auto: true } // Always initialize this fixture even if not used in test
  ],
  server: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const { createServer } = await import('#server/server.js')
      const testServer = await createServer({ skipMongoDb: true })

      // Add a mock db object that can be spied on
      // This allows tests to do: vi.spyOn(server.db, 'collection')
      const mockDb = {
        collection: vi.fn()
      }

      testServer.decorate('server', 'db', mockDb)
      testServer.decorate('request', 'db', mockDb)

      await testServer.initialize()

      /** @type {TestServer} */
      const server = /** @type {*} */ (testServer)

      server.loggerMocks = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn()
      }

      server.ext('onRequest', (request, h) => {
        vi.spyOn(request.logger, 'info').mockImplementation(
          server.loggerMocks.info
        )
        vi.spyOn(request.logger, 'error').mockImplementation(
          server.loggerMocks.error
        )
        vi.spyOn(request.logger, 'warn').mockImplementation(
          server.loggerMocks.warn
        )
        return h.continue
      })

      await use(server)

      await testServer.stop()
    },
    { scope: 'file' }
  ]
})
