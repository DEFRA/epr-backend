export const SYSTEM_LOGS_COLLECTION_NAME = 'system-logs'

/**
 * Ensures the collection exists with required indexes.
 * Safe to call multiple times - MongoDB createIndex is idempotent.
 *
 * @param {import('mongodb').Db} db
 * @returns {Promise<import('mongodb').Collection>}
 */
async function ensureCollection(db) {
  const collection = db.collection(SYSTEM_LOGS_COLLECTION_NAME)

  // Optimises system log queries by organisation ID
  await collection.createIndex({ 'context.organisationId': 1 })

  return collection
}

/**
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @returns {Promise<import('./port.js').SystemLogsRepositoryFactory>}
 */
export const createSystemLogsRepository = async (db) => {
  await ensureCollection(db)

  return (logger) => ({
    async insert(systemLog) {
      try {
        await db.collection(SYSTEM_LOGS_COLLECTION_NAME).insertOne({
          schemaVersion: 1,
          ...systemLog
        })
      } catch (error) {
        logger.error({
          error,
          message: 'Failed to internally record system log'
        })
      }
    },

    async findByOrganisationId(organisationId) {
      const docs = await db
        .collection(SYSTEM_LOGS_COLLECTION_NAME)
        .find({ 'context.organisationId': organisationId })
        .sort({ createdAt: -1 }) // most recent first
        .toArray()

      return docs.map((doc) => ({
        event: doc.event,
        context: doc.context,
        createdAt: doc.createdAt,
        createdBy: doc.createdBy
      }))
    }
  })
}
