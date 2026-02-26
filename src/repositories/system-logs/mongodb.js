import { ObjectId } from 'mongodb'

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

  // Compound index covers filter (organisationId) and sort (_id desc)
  // for paginated queries. Supersedes the previous single-field index.
  await collection.createIndex({ 'context.organisationId': 1, _id: -1 })

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
          err: error,
          message: 'Failed to internally record system log'
        })
      }
    },

    async findByOrganisationId({ organisationId, limit, cursor }) {
      const filter = { 'context.organisationId': organisationId }

      if (cursor) {
        filter._id = { $lt: ObjectId.createFromHexString(cursor) }
      }

      const docs = await db
        .collection(SYSTEM_LOGS_COLLECTION_NAME)
        .find(filter)
        .sort({ _id: -1 })
        .limit(limit + 1)
        .toArray()

      const hasMore = docs.length > limit
      const items = hasMore ? docs.slice(0, limit) : docs

      return {
        systemLogs: items.map((doc) => ({
          event: doc.event,
          context: doc.context,
          createdAt: doc.createdAt,
          createdBy: doc.createdBy
        })),
        hasMore,
        nextCursor: hasMore ? items.at(-1)._id.toHexString() : null
      }
    }
  })
}
