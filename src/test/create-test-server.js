import { createServer } from '#server/server.js'
import { vi } from 'vitest'

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
 * @returns {Promise<TestServer>}
 */
export async function createTestServer(options = {}) {
  // If repositories are provided, assume in-memory mode and skip MongoDB
  const skipMongoDb = options.repositories !== undefined

  const server = await createServer({
    ...options,
    skipMongoDb
  })
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
