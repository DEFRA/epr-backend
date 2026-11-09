import { setupServer } from 'msw/node'
import { test } from 'vitest'
import { mockOidcHandlers } from '#vite/helpers/mock-oidc-servers.js'
import { onUnhandledFrame } from '#vite/setup-msw.js'

/**
 * A strict msw server shared across the file, answering auth requests by
 * default; handlers a test adds with `msw.use()` are dropped after it.
 */
export const it = test
  .extend(
    'mswServer',
    { scope: 'file' },
    // eslint-disable-next-line no-empty-pattern
    async ({}, { onCleanup }) => {
      const server = setupServer(...mockOidcHandlers)
      server.listen({ onUnhandledFrame })
      onCleanup(() => server.close())

      return server
    }
  )
  .extend('msw', { auto: true }, async ({ mswServer }, { onCleanup }) => {
    onCleanup(() => mswServer.resetHandlers())

    return mswServer
  })
