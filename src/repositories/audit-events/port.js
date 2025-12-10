
/**
 * @typedef {Object} AuditingPayload
 * @property {Object} event - Event summary
 * @property {Object} context - Contextual data for event
 */

/**
 * @typedef {Object} AuditEventsRepository
 * @property {(auditingPayload: AuditingPayload) => Promise<void>} insert
 * @property {(id: string) => Promise<AuditingPayload[]>} findByOrganisationId
 */

/**
 * @typedef {(logger: import('#common/helpers/logging/logger.js').TypedLogger) => AuditEventsRepository} AuditEventsRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
