import { MongoClient } from 'mongodb'

import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createWasteRecordsRepository } from '#repositories/waste-records/mongodb.js'
import { createMongoStreamRepository } from '#waste-balances/repository/stream-mongodb.js'
import { createMongoRowStateRepository } from '#waste-records/repository/mongodb.js'
import { createOverseasSitesRepository } from '#overseas-sites/repository/mongodb.js'
import { runReconciliation } from '#waste-records/monitoring/run-reconciliation.js'
import { formatReport } from '#waste-records/monitoring/format-report.js'
import { createReadOnlyDb } from '#waste-records/monitoring/read-only-db.js'

/**
 * Read-only discrepancy report comparing the committed row-state collection
 * (ADR-0037) against the legacy waste-records committed state across an
 * environment. A CLEAN verdict is the green light for the backfill-complete
 * check and the irreversible write-flag flip.
 *
 * Connects to the MongoDB pointed at by MONGO_URI / MONGO_DATABASE through a
 * read-only Db guard, so it reuses the production repositories' battle-tested
 * read and mapping logic while issuing no writes — the factories' index
 * assurance is neutralised and any data write would throw. Exits 0 on a clean
 * estate, 1 when discrepancies remain, so it can gate a deployment step.
 *
 * Usage:
 *   MONGO_URI=… MONGO_DATABASE=… node scripts/waste-record-states-discrepancy
 *   npm run report:row-state-discrepancy
 */
const main = async () => {
  const uri = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017'
  const dbName = process.env.MONGO_DATABASE ?? 'epr-backend'

  const client = new MongoClient(uri, { readPreference: 'secondaryPreferred' })

  try {
    await client.connect()
    const db = createReadOnlyDb(client.db(dbName))

    const [
      organisationsFactory,
      streamFactory,
      rowStateFactory,
      wasteRecordsFactory,
      overseasSitesFactory
    ] = await Promise.all([
      createOrganisationsRepository(db),
      createMongoStreamRepository(db),
      createMongoRowStateRepository(db),
      createWasteRecordsRepository(db),
      createOverseasSitesRepository(db)
    ])

    const result = await runReconciliation({
      organisationsRepository: organisationsFactory(),
      streamRepository: streamFactory(),
      rowStateRepository: rowStateFactory(),
      wasteRecordsRepository: wasteRecordsFactory(),
      overseasSitesRepository: overseasSitesFactory()
    })

    console.log(formatReport(result))

    process.exitCode = result.census.isEstateClean ? 0 : 1
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
