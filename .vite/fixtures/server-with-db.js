import { it as dbTest } from './mongo.js'

/**
 * @import { TestAPI } from 'vitest'
 * @import { HapiServer } from '#common/hapi-types.js'
 */

/**
 * vitest cannot infer scoped-fixture (tuple-form) value types in JSDoc/tsc, so
 * the fixture shape is asserted here, at the boundary, and flows to every
 * consumer typed.
 */
export const it =
  /**
   * @type {TestAPI<{
   *   db: string
   *   server: HapiServer
   * }>}
   */ (
    dbTest.extend({
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
  )
