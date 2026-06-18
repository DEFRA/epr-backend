import { isPayloadSmallEnoughToAudit, safeAudit } from './helpers.js'

/**
 * @import {SystemLogsRepository} from '#repositories/system-logs/port.js'
 */

const SYSTEM_USER = { id: 'system', email: 'system', scope: [] }

/**
 * Audit a duplicate accreditation link fix for an organisation.
 * This is a system-initiated action (no user request context).
 * Logs the full organisation state before and after the fix.
 *
 * @param {SystemLogsRepository} systemLogsRepository
 * @param {string} organisationId
 * @param {Object} previous - Organisation state before fix
 * @param {Object} next - Organisation state after fix
 */
async function auditDuplicateAccreditationLinkMigration(
  systemLogsRepository,
  organisationId,
  previous,
  next
) {
  const payload = {
    event: {
      category: 'entity',
      subCategory: 'epr-organisations',
      action: 'duplicate-accreditation-link-migration'
    },
    context: {
      organisationId,
      previous,
      next
    },
    user: SYSTEM_USER
  }

  const safeAuditingPayload = isPayloadSmallEnoughToAudit(payload)
    ? payload
    : {
        ...payload,
        context: { organisationId }
      }

  safeAudit(safeAuditingPayload)

  await systemLogsRepository.insert({
    createdAt: new Date(),
    createdBy: SYSTEM_USER,
    event: payload.event,
    context: payload.context
  })
}

export { auditDuplicateAccreditationLinkMigration }
