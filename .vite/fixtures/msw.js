import { setupServer } from 'msw/node'
import { test } from 'vitest'
import { mockOidcHandlers } from '#vite/helpers/mock-oidc-servers.js'
import { onUnhandledFrame } from '#vite/setup-msw.js'

/**
 * @import { SetupServer } from 'msw/node'
 * @import { TestAPI } from 'vitest'
 */

/**
 * Each test gets its own strict msw server, answering auth requests by
 * default; add handlers with `msw.use()`.
 */
export const it = /** @type {TestAPI<{ msw: SetupServer }>} */ (
  test.extend({
    msw: [
      // eslint-disable-next-line no-empty-pattern
      async ({}, use) => {
        const server = setupServer(...mockOidcHandlers)
        server.listen({ onUnhandledFrame })

        await use(server)

        server.close()
      },
      { auto: true }
    ]
  })
)
