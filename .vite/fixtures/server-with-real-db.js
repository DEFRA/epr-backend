import { MongoClient } from 'mongodb'

import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { createTestServer } from '#test/create-test-server.js'
import { createMongoLedgerRepository } from '#waste-balances/repository/ledger-mongodb.js'

/**
 * @import { TestAPI } from 'vitest'
 * @import { Db } from 'mongodb'
 * @import { TestServer } from '#test/create-test-server.js'
 */

/**
 * A test server with its `db` decoration guaranteed present (this fixture always
 * supplies one), so tests can seed and assert against `server.db` directly.
 *
 * @typedef {TestServer & { db: Db }} RealDbTestServer
 */

const DATABASE_NAME = 'epr-backend'

/**
 * A real Hapi server whose `request.db` and `request.ledgerRepository` are both
 * backed by one in-memory Mongo, so raw-`db` routes can be exercised end-to-end
 * through `server.inject`. Seed and assert against the same db via `server.db`.
 *
 * Prefer this over `createTestServer()` alone for the legacy routes that read
 * `request.db` directly (tonnage-monitoring, prn-tonnage,
 * waste-balance-availability); once those move to repositories, delete this and
 * use in-memory repositories instead.
 */
export const it = /** @type {TestAPI<{ server: RealDbTestServer }>} */ (
  mongoIt.extend({
    server: [
      async (/** @type {{ db: string }} */ { db }, use) => {
        const client = await MongoClient.connect(db)
        const mongoDb = client.db(DATABASE_NAME)
        const ledgerRepository = (await createMongoLedgerRepository(mongoDb))()
        const server = await createTestServer({
          db: mongoDb,
          repositories: { ledgerRepository }
        })

        await use(/** @type {RealDbTestServer} */ (server))

        await server.stop()
        await client.close()
      },
      { scope: 'file' }
    ]
  })
)
