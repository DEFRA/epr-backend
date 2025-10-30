import { test } from 'vitest'

export const it = test.extend(
  {
    // eslint-disable-next-line no-empty-pattern
    server: async ({}, use) => {
      const { createServer } = await import('#server/server.js')
      const server = await createServer({ skipMongoDb: true })
      await server.initialize()

      await use(server)

      await server.stop()
    }
  },
  { scope: 'file' }
)
