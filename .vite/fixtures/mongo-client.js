import { MongoClient } from 'mongodb'

import { it as mongoIt } from '#vite/fixtures/mongo.js'

/**
 * @import { TestAPI } from 'vitest'
 * @import { MongoClient as MongoClientType } from 'mongodb'
 */

export const DATABASE_NAME = 'epr-backend'

/**
 * Extends the in-memory Mongo `db` fixture (a URI) with a connected
 * `MongoClient`, closed on teardown. For application-level integration tests
 * that query mongo directly, without a Hapi server.
 */
export const it = /** @type {TestAPI<{ mongoClient: MongoClientType }>} */ (
  mongoIt.extend({
    mongoClient: async (/** @type {{ db: string }} */ { db }, use) => {
      const client = await MongoClient.connect(db)
      await use(client)
      await client.close()
    }
  })
)
