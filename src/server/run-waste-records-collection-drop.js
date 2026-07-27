import { logger } from '#common/helpers/logging/logger.js'

const LOCK_NAME = 'waste-records-collection-drop'
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
const dropWasteRecordsCollection = async (db, isDryRun) => {
  if (!(await wasteRecordsCollectionExists(db))) {
    logger.info({
      message: `Waste records collection drop: ${COLLECTION_WASTE_RECORDS} is already absent, nothing to drop`
    })
    return
  }

  const documents = await db
    .collection(COLLECTION_WASTE_RECORDS)
    .countDocuments()

  if (isDryRun) {
    logger.info({
      message: `Waste records collection drop: ${COLLECTION_WASTE_RECORDS} is still present with ${documents} documents; leaving it in place because the drop is not enabled`
    })
    return
  }

  await db.dropCollection(COLLECTION_WASTE_RECORDS)

  logger.info({
    message: `Waste records collection drop: dropped ${COLLECTION_WASTE_RECORDS}, which held ${documents} documents`
  })
}

/**
 * Startup migration that removes the decommissioned `waste-records`
 * collection. Idempotent: a boot that finds it already gone logs and returns.
 * Runs under a cross-instance lock so a single pod per deploy performs it.
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
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping waste records collection drop'
      })
      return
    }
    try {
      await dropWasteRecordsCollection(server.db, isDryRun)
    } finally {
      await lock.free()
    }
  } catch (error) {
    logger.error({
      err: error,
      message: 'Failed to run waste records collection drop'
    })
  }
}
