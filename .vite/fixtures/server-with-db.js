import { it as dbTest } from './mongo.js'

export const it = dbTest.extend({
  server: [
    // destructuring db triggers MongoDB setup even though it is unused here
    async ({ db: _db }, use) => {
      const { createServer } = await import('#server/server.js')
      const server = await createServer()
      await server.initialize()

      await use(server)

      await server.stop()
    },
    { scope: 'file' }
  ]
})
