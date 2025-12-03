import { it as dbTest } from './mongo.js'

export const it = dbTest.extend({
  server: [
    async ({ db }, use) => {
      // db parameter triggers MongoDB setup (unused directly)
      const _dbUri = db
      const { createServer } = await import('#server/server.js')
      const server = await createServer()
      await server.initialize()

      await use(server)

      await server.stop()
    },
    { scope: 'file' }
  ]
})
