import { safeAudit } from './helpers.js'

/**
 * @import {SystemLogsRepository} from '#repositories/system-logs/port.js'
 */

const SYSTEM_USER = { id: 'system', email: 'system', scope: [] }

const EVENT = {
  category: 'entity',
  subCategory: 'epr-organisations',
  action: 'migrate-form-submission-lineage'
}

/**
 * Audit a form submission lineage migration for an organisation.
 * This is a system-initiated action (no user request context).
 * Logs the full organisation state before and after migration.
 *
 * @param {SystemLogsRepository} systemLogsRepository
 * @param {string} organisationId
 * @param {Object} previous - Organisation state before migration
 * @param {Object} next - Organisation state after migration
 */
async function auditFormSubmissionLineageMigration(
  systemLogsRepository,
  organisationId,
  previous,
  next
) {
  safeAudit({ event: EVENT, user: SYSTEM_USER }, () => ({ organisationId }))

  // System logs have no size limit - always store full state
  await systemLogsRepository.insert({
    createdAt: new Date(),
    createdBy: SYSTEM_USER,
    event: EVENT,
    context: {
      organisationId,
      previous,
      next
    }
  })
}

export { auditFormSubmissionLineageMigration }
