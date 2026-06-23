declare global {
  // Set by vitest-mongodb's setup for the in-memory MongoDB instance.
  // eslint-disable-next-line no-var
  var __MONGO_URI__: string
}

export {}
