export const SYSTEM_LOGS_COLLECTION_NAME = 'system-logs'

/**
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @returns {import('./port.js').SystemLogsRepositoryFactory}
 */
export const createSystemLogsRepository = (db) => (logger) => ({
  async insert(systemLog) {
    try {
      await db
        .collection(SYSTEM_LOGS_COLLECTION_NAME)
        .insertOne({ ...systemLog }) // spread operator here to avoid mutating systemLog (Mongo DB adds a _id)
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
      .toArray()

    return docs.map((doc) => ({
      event: doc.event,
      context: doc.context,
      createdAt: doc.createdAt
    }))
  }
})
