declare global {
  // Set by vitest-mongodb's setup for the in-memory MongoDB instance.
  // eslint-disable-next-line no-var
  var __MONGO_URI__: string

  // Requests msw intercepted without a handler, counted for the whole worker.
  // eslint-disable-next-line no-var
  var __mswUnhandledFrames: { count: number } | undefined
}

export {}
