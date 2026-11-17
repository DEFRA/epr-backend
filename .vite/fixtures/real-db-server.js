import { MongoClient } from 'mongodb'

import { DATABASE_NAME } from '#vite/fixtures/mongo-client.js'
import { createMongoLedgerRepository } from '#waste-balances/repository/ledger-mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/mongodb.js'
import { createOrganisationReadRepository } from '#organisation-read-model/repository/mongodb.js'
import { createOverseasSitesRepository } from '#overseas-sites/repository/mongodb.js'

/**
 * @import { Db } from 'mongodb'
 * @import { CreateTestServerOptions, TestServer } from '#test/create-test-server.js'
 */

/**
 * A test server with its `db` decoration guaranteed present (this fixture always
 * supplies one), so tests can seed and assert against `server.db` directly.
 *
 * @typedef {TestServer & { db: Db }} TestServerWithRealDb
 */

/**
 * A file-scoped `server` fixture for the mongo fixture's `extend`: a server
 * from `createServer` whose `request.db`, `request.ledgerRepository`,
 * `request.organisationAdministrationRepository`,
 * `request.organisationReadRepository` and
 * `request.packagingRecyclingNotesRepository` are all backed by one in-memory
 * Mongo, so reporting routes can be exercised end-to-end through
 * `server.inject`. Seed and assert against the same db via `server.db`.
 *
 * This suits the read-model reporting routes (tonnage-monitoring, prn-tonnage,
 * waste-balance-availability): their heavy aggregation pipelines are best
 * verified against a real mongo, not reimplemented behind an in-memory
 * repository. Use an in-memory test server for routes whose data access
 * genuinely belongs behind a port.
 *
 * @param {(options: CreateTestServerOptions) => Promise<TestServer>} createServer
 * @returns {[
 *   (context: { db: string }, use: (server: TestServerWithRealDb) => Promise<void>) => Promise<void>,
 *   { scope: 'file' }
 * ]}
 */
export const serverOnRealDb = (createServer) => [
  async ({ db }, use) => {
    const client = await MongoClient.connect(db)

    try {
      const mongoDb = client.db(DATABASE_NAME)
      const ledgerRepository = (await createMongoLedgerRepository(mongoDb))()
      const organisationAdministrationRepository = (
        await createOrganisationsRepository(mongoDb)
      )()
      const packagingRecyclingNotesRepository =
        await createPackagingRecyclingNotesRepository(mongoDb, [])
      const organisationReadRepository = createOrganisationReadRepository(
        mongoDb
      )({
        overseasSitesRepository: (
          await createOverseasSitesRepository(mongoDb)
        )(),
        logger: { warn: () => {} }
      })
      const server = await createServer({
        db: mongoDb,
        repositories: {
          ledgerRepository,
          organisationAdministrationRepository,
          organisationReadRepository,
          packagingRecyclingNotesRepository
        }
      })

      await use(/** @type {TestServerWithRealDb} */ (server))

      await server.stop()
    } finally {
      await client.close()
    }
  },
  { scope: 'file' }
]
