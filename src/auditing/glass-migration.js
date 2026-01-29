import { audit } from '@defra/cdp-auditing'
import { isPayloadSmallEnoughToAudit } from './helpers.js'

/**
 * @import {SystemLogsRepository} from '#repositories/system-logs/port.js'
 */

const SYSTEM_USER = { id: 'system', email: 'system', scope: [] }

/**
 * Audit a glass migration for an organisation.
 * This is a system-initiated action (no user request context).
 * Logs the full organisation state before and after migration.
 *
 * @param {SystemLogsRepository} systemLogsRepository
 * @param {string} organisationId
 * @param {Object} previous - Organisation state before migration
 * @param {Object} next - Organisation state after migration
 */
async function auditGlassMigration(
  systemLogsRepository,
  organisationId,
  previous,
  next
) {
  const payload = {
    event: {
      category: 'entity',
      subCategory: 'epr-organisations',
      action: 'glass-migration'
    },
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

  audit(safeAuditingPayload)

  // System logs have no size limit - always store full state
  await systemLogsRepository.insert({
    createdAt: new Date(),
    createdBy: SYSTEM_USER,
    event: payload.event,
    context: payload.context
  })
}

export { auditGlassMigration }
