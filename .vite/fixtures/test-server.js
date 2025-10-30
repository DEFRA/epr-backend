import { it as serverWithDbTest } from './server-with-db.js'
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

export const it = serverWithDbTest.extend(
  {
    testServer: async ({ server }, use) => {
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
    }
  },
  { scope: 'file' }
)
