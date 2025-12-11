import { audit } from '@defra/cdp-auditing'

export const AUDIT_EVENTS_COLLECTION_NAME = 'audit-events'

/**
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @returns {import('./port.js').AuditEventsRepositoryFactory}
 */
export const createAuditEventsRepository = (db) => (logger) => ({
  async insert(auditingPayload) {
    audit(auditingPayload)

    try {
      await db.collection(AUDIT_EVENTS_COLLECTION_NAME).insertOne({
        createdAt: new Date(),
        ...auditingPayload
      })
    } catch (error) {
      logger.error({
        error,
        message: 'Failed to internally record auditing event'
      })
    }
  },

  async findByOrganisationId(organisationId) {
    const docs = await db
      .collection(AUDIT_EVENTS_COLLECTION_NAME)
      .find({ 'context.organisationId': organisationId })
      .toArray()

    return docs.map((doc) => ({
      event: doc.event,
      context: doc.context,
      createdAt: doc.createdAt
    }))
  }
})
