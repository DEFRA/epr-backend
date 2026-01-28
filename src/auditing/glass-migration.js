import { audit } from '@defra/cdp-auditing'
import { isPayloadSmallEnoughToAudit } from './helpers.js'

/**
 * @import {SystemLogsRepository} from '#repositories/system-logs/port.js'
 */

const SYSTEM_USER = { id: 'system', email: 'system', scope: [] }

/**
 * Audit a glass migration for an organisation.
 * This is a system-initiated action (no user request context).
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

  // Prevent sending large payloads to CDP library (causes error and audit event is lost)
  const safeAuditingPayload = isPayloadSmallEnoughToAudit(payload)
    ? payload
    : { ...payload, context: { organisationId } }

  audit(safeAuditingPayload)

  // System logs always get the full payload
  await systemLogsRepository.insert({
    createdAt: new Date(),
    createdBy: SYSTEM_USER,
    event: payload.event,
    context: payload.context
  })
}

export { auditGlassMigration }
