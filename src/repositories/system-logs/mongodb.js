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

  await collection.createIndex({ 'context.organisationId': 1, _id: -1 })
  await collection.createIndex({ 'createdBy.id': 1, _id: -1 })

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

    async find({
      organisationId,
      userId,
      subCategory,
      limit,
      cursor,
      direction
    }) {
      const isPrev = direction === 'prev'

      const filter = {}

      if (organisationId) {
        filter['context.organisationId'] = organisationId
      }
      if (userId) {
        filter['createdBy.id'] = userId
      }
      if (subCategory) {
        filter['event.subCategory'] = subCategory
      }
      if (cursor) {
        const cursorId = ObjectId.createFromHexString(cursor)
        filter._id = isPrev ? { $gt: cursorId } : { $lt: cursorId }
      }

      const docs = await db
        .collection(SYSTEM_LOGS_COLLECTION_NAME)
        .find(filter)
        .sort({ _id: isPrev ? 1 : -1 })
        .limit(limit + 1)
        .toArray()

      const hasExtra = docs.length > limit
      let page = hasExtra ? docs.slice(0, limit) : docs
      if (isPrev) {
        page = page.reverse()
      }

      const hasNext = isPrev ? page.length > 0 : hasExtra
      const hasPrev = isPrev ? hasExtra : Boolean(cursor)

      const firstRow = page[0]
      const lastRow = page.at(-1)

      return {
        systemLogs: page.map((doc) => ({
          event: doc.event,
          context: doc.context,
          createdAt: doc.createdAt,
          createdBy: doc.createdBy
        })),
        hasNext,
        hasPrev,
        nextCursor: hasNext && lastRow ? lastRow._id.toHexString() : null,
        prevCursor: hasPrev && firstRow ? firstRow._id.toHexString() : null
      }
    }
  })
}
