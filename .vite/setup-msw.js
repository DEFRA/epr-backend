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

afterEach(() => {
  const count = unhandledFrames
  unhandledFrames = 0

  if (count > 0) {
    throw new Error(
      `${count} request(s) had no msw handler, see the [MSW] errors above`
    )
  }
})
