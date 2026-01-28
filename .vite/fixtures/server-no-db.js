import { test } from 'vitest'

export const it = test.extend({
  server: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const { createServer } = await import('#server/server.js')
      const server = await createServer({
        skipMongoDb: true,
        skipQueueConsumer: true
      })
      await server.initialize()

      await use(server)

      await server.stop()
    },
    { scope: 'file' }
  ]
})
