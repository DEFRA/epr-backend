/**
 * @typedef {{
 *   event: {
 *     category: string
 *     action: string
 *   }
 *   context: Object & {
 *     organisationId?: string
 *   }
 * }} AuditingPayload
 */

/**
 * @typedef { AuditingPayload & { createdAt: Date } } AuditingPayloadWithCreatedAt
 */

/**
 * @typedef {{
 *   insert: (auditingPayload: AuditingPayload) => Promise<void>
 *   findByOrganisationId: (id: string) => Promise<AuditingPayloadWithCreatedAt[]>
 * }} AuditEventsRepository
 */

/**
 * @typedef {(logger: import('#common/helpers/logging/logger.js').TypedLogger) => AuditEventsRepository} AuditEventsRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
