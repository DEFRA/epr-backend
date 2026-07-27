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
    return
  }

  const documents = await db
    .collection(COLLECTION_WASTE_RECORDS)
    .estimatedDocumentCount()

  if (isDryRun) {
    logger.info({
      message: `Waste records collection drop: ${COLLECTION_WASTE_RECORDS} is still present with ${documents} documents; leaving it in place because the drop is not enabled`
    })
    return
  }

  await db.dropCollection(COLLECTION_WASTE_RECORDS)

  // Mongo recreates a collection on first insert, so finding documents in one
  // nothing should be writing to means a writer survives somewhere and the
  // drop will not stick. Warn so that boot stands out from the expected
  // empty one.
  if (documents > 0) {
    logger.warn({
      message: `Waste records collection drop: dropped ${COLLECTION_WASTE_RECORDS}, which held ${documents} documents — anything still writing to it will recreate it`
    })
    return
  }

  logger.info({
    message: `Waste records collection drop: dropped empty ${COLLECTION_WASTE_RECORDS}`
  })
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
 * about to be deleted is known before the flag is turned on.
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
