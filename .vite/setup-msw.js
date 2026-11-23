import { setupServer } from 'msw/node'

/**
 * @import { RequestHandler } from 'msw'
 * @import { SetupServer } from 'msw/node'
 */

/**
 * Kept on the global, not in this module: a worker that runs files without
 * isolation loads this module again for each file, while helpers that import
 * it keep the first copy.
 */
globalThis.__mswUnhandledFrames ??= { count: 0 }
const unhandledFrames = globalThis.__mswUnhandledFrames

/**
 * Pass to every msw `listen()`, so a test whose request has no handler fails
 * even when the code under test handles the rejected fetch.
 * @param {{ defaults: { error: () => void } }} args
 */
export const onUnhandledFrame = ({ defaults }) => {
  unhandledFrames.count++
  defaults.error()
}

/**
 * Intercept http in the enclosing describe (or file) with the given handlers.
 * Handlers added with `server.use()` in a test are dropped after it.
 * @param {...RequestHandler} handlers
 * @returns {SetupServer}
 */
export const setupMsw = (...handlers) => {
  const server = setupServer(...handlers)

  beforeAll(() => {
    server.listen({ onUnhandledFrame })
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
  })

  return server
}

afterEach(() => {
  const { count } = unhandledFrames
  unhandledFrames.count = 0

  if (count > 0) {
    throw new Error(
      `${count} request(s) had no msw handler, see the [MSW] errors above`
    )
  }
})
