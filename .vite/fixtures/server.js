import { createTestServer } from '#test/create-test-server.js'
import { it as mswIt } from '#vite/fixtures/msw.js'

/**
 * @import { CreateTestServerOptions } from '#test/create-test-server.js'
 */

/**
 * Each test gets its own server with in-memory repositories, started once msw
 * is listening; seed through `server.app`, and change `config` or
 * `repositories` for a describe with `it.override()`.
 */
export const it = mswIt
  .extend('config', /** @type {CreateTestServerOptions['config']} */ ({}))
  .extend(
    'repositories',
    /** @type {CreateTestServerOptions['repositories']} */ ({})
  )
  .extend(
    'server',
    async ({ config, msw: _msw, repositories }, { onCleanup }) => {
      const server = await createTestServer({ config, repositories })
      onCleanup(() => server.stop())

      return server
    }
  )
