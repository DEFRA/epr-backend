import { safeAudit } from './helpers.js'

/**
 * @import {SystemLogsRepository} from '#repositories/system-logs/port.js'
 */

const SYSTEM_USER = { id: 'system', email: 'system', scope: [] }

/**
 * Audit an incremental form migration for an organisation.
 * This is a system-initiated action (no user request context).
 * Logs the full organisation state before and after migration.
 *
 * @param {SystemLogsRepository} systemLogsRepository
 * @param {string} organisationId
 * @param {Object} previous - Organisation state before migration
 * @param {Object} next - Organisation state after migration
 */
async function auditIncrementalFormMigration(
  systemLogsRepository,
  organisationId,
  previous,
  next
) {
  const event = {
    category: 'entity',
    subCategory: 'epr-organisations',
    action: 'incremental-form-migration'
  }

  safeAudit({ event, user: SYSTEM_USER }, () => ({ organisationId }))

  // System logs have no size limit - always store full state
  await systemLogsRepository.insert({
    createdAt: new Date(),
    createdBy: SYSTEM_USER,
    event,
    context: { organisationId, previous, next }
  })
}

export { auditIncrementalFormMigration }
