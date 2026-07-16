import { test as baseTest } from 'vitest'
import { setup as setupMongo, teardown as teardownMongo } from 'vitest-mongodb'

// The `db` fixture yields the in-memory Mongo URI (a string). vitest cannot
// infer a scoped fixture's value type in JSDoc, so the string type is asserted
// here, at the boundary, and flows to every consumer typed.
export const it = /** @type {import('vitest').TestAPI<{ db: string }>} */ (
  baseTest.extend({
    db: [
      // eslint-disable-next-line no-empty-pattern
      async ({}, use) => {
        await setupMongo({
          serverOptions: {}
        })

        const mongoUri = globalThis.__MONGO_URI__
        process.env.MONGO_URI = mongoUri

        await use(mongoUri)

        await teardownMongo()
      },
      { scope: 'file' }
    ]
  })
)
