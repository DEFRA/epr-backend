import { isPayloadSmallEnoughToAudit, safeAudit } from './helpers.js'

/**
 * @import {SystemLogsRepository} from '#repositories/system-logs/port.js'
 */

const SYSTEM_USER = { id: 'system', email: 'system', scope: [] }

const EVENT = {
  category: 'entity',
  subCategory: 'epr-organisations',
  action: 'migrate-registration-contacts'
}

/**
 * Audit a registration contacts migration for an organisation.
 * This is a system-initiated action (no user request context).
 * Logs the full organisation state before and after migration.
 *
 * @param {SystemLogsRepository} systemLogsRepository
 * @param {string} organisationId
 * @param {Object} previous - Organisation state before migration
 * @param {Object} next - Organisation state after migration
 */
async function auditRegistrationContactsMigration(
  systemLogsRepository,
  organisationId,
  previous,
  next
) {
  const payload = {
    event: EVENT,
    context: {
      organisationId,
      previous,
      next
    },
    user: SYSTEM_USER
  }

  // CDP audit has size limits - send reduced context if too big
  const safeAuditingPayload = isPayloadSmallEnoughToAudit(payload)
    ? payload
    : {
        ...payload,
        context: { organisationId }
      }

  safeAudit(safeAuditingPayload)

  // System logs have no size limit - always store full state
  await systemLogsRepository.insert({
    createdAt: new Date(),
    createdBy: SYSTEM_USER,
    event: EVENT,
    context: payload.context
  })
}

export { auditRegistrationContactsMigration }
