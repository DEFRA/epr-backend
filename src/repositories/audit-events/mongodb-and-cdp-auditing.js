import { audit } from '@defra/cdp-auditing'

export const AUDIT_EVENTS_COLLECTION_NAME = 'audit-events'

/**
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @returns {import('./port.js').AuditEventsRepositoryFactory}
 */
export const createAuditEventsRepository = (db) => (_logger) => ({
  async insert(auditingPayload) {
    audit(auditingPayload)

    // TODO try/catch, on catch, log (CDP auditing _should_ have happened, but could not create system log - capture _something in logs_)
    await db
      .collection(AUDIT_EVENTS_COLLECTION_NAME)
      .insertOne({ ...auditingPayload })
  },

  async findByOrganisationId(organisationId) {
    const docs = await db
      .collection(AUDIT_EVENTS_COLLECTION_NAME)
      .find({ 'context.organisationId': organisationId })
      .toArray()

    return docs.map((doc) => ({ event: doc.event, context: doc.context }))
  }
})
