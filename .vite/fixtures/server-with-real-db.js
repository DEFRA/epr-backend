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
 * @typedef {TestServer & { db: Db }} TestServerWithRealDb
 */

const DATABASE_NAME = 'epr-backend'

/**
 * A real Hapi server whose `request.db` and `request.ledgerRepository` are both
 * backed by one in-memory Mongo, so routes that query mongo directly can be
 * exercised end-to-end through `server.inject`. Seed and assert against the same
 * db via `server.db`.
 *
 * This suits the read-model reporting routes (tonnage-monitoring, prn-tonnage,
 * waste-balance-availability): their heavy aggregation pipelines are best
 * verified against a real mongo, not reimplemented behind an in-memory
 * repository. Use `createTestServer()` with in-memory repositories for routes
 * whose data access genuinely belongs behind a port.
 */
export const it = /** @type {TestAPI<{ server: TestServerWithRealDb }>} */ (
  mongoIt.extend({
    server: [
      async (/** @type {{ db: string }} */ { db }, use) => {
        const client = await MongoClient.connect(db)

        try {
          const mongoDb = client.db(DATABASE_NAME)
          const ledgerRepository = (
            await createMongoLedgerRepository(mongoDb)
          )()
          const server = await createTestServer({
            db: mongoDb,
            repositories: { ledgerRepository }
          })

          await use(/** @type {TestServerWithRealDb} */ (server))

          await server.stop()
        } finally {
          await client.close()
        }
      },
      { scope: 'file' }
    ]
  })
)
