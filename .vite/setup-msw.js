import { setupServer } from 'msw/node'

/**
 * @import { RequestHandler } from 'msw'
 * @import { SetupServer } from 'msw/node'
 */

let unhandledFrames = 0

/**
 * Pass to every msw `listen()`, so a test whose request has no handler fails
 * even when the code under test handles the rejected fetch.
 * @param {{ defaults: { error: () => void } }} args
 */
export const onUnhandledFrame = ({ defaults }) => {
  unhandledFrames++
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
  const count = unhandledFrames
  unhandledFrames = 0

  if (count > 0) {
    throw new Error(
      `${count} request(s) had no msw handler, see the [MSW] errors above`
    )
  }
})
