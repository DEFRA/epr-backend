import { logger } from '#common/helpers/logging/logger.js'

const COLLECTION_WASTE_RECORDS = 'waste-records'

/**
 * @param {import('mongodb').Db} db
 * @returns {Promise<boolean>}
 */
const wasteRecordsCollectionExists = async (db) => {
  const matches = await db
    .listCollections({ name: COLLECTION_WASTE_RECORDS }, { nameOnly: true })
    .toArray()

  return matches.length > 0
}

/**
 * @param {import('mongodb').Db} db
 * @param {boolean} isDryRun
 */
const dropOrReportWasteRecordsCollection = async (db, isDryRun) => {
  if (!(await wasteRecordsCollectionExists(db))) {
    logger.info({
      message: `Waste records collection drop: ${COLLECTION_WASTE_RECORDS} is already absent, nothing to drop`
    })
  } else if (isDryRun) {
    // The count is only worth reporting while the collection survives, where it
    // says how much is about to be deleted. Counting on the drop path instead
    // would race a concurrent pod's drop and report zero for a collection that
    // held data.
    const documents = await db
      .collection(COLLECTION_WASTE_RECORDS)
      .estimatedDocumentCount()

    logger.info({
      message: `Waste records collection drop: ${COLLECTION_WASTE_RECORDS} is still present with ${documents} documents; leaving it in place because the drop is not enabled`
    })
  } else {
    await db.dropCollection(COLLECTION_WASTE_RECORDS)

    // Mongo recreates a collection on first insert, so only the first enabled
    // boot in an environment should find this one still here. Warn rather than
    // inform: a recurrence on a later deploy means a writer survives somewhere
    // and the drop will not stick.
    logger.warn({
      message: `Waste records collection drop: dropped ${COLLECTION_WASTE_RECORDS}; expected once per environment, so a recurrence on a later deploy means something is still writing to it`
    })
  }
}

/**
 * Startup migration that removes the decommissioned `waste-records`
 * collection. Idempotent, and needs no cross-instance lock: dropping an absent
 * collection succeeds and counting one returns zero, so every pod in a deploy
 * can run it concurrently without erroring.
 *
 * Gated by the drop-waste-records-collection feature flag. With the flag off
 * it runs as a dry run — reporting whether the collection is still present in
 * this environment and how many documents it holds — so the size of what is
 * about to be deleted is known before the flag is turned on. Running per pod
 * rather than per deploy, that report repeats once per pod on every boot.
 *
 * @param {Object} server - Hapi server instance
 */
export const runWasteRecordsCollectionDrop = async (server) => {
  const isDryRun = !server.featureFlags.isDropWasteRecordsCollectionEnabled()

  try {
    await dropOrReportWasteRecordsCollection(server.db, isDryRun)
  } catch (error) {
    logger.error({
      err: error,
      message: 'Failed to run waste records collection drop'
    })
  }
}
