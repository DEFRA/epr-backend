import {
  isPayloadSmallEnoughToAudit,
  safeAudit,
  SYSTEM_USER
} from './helpers.js'
import { toOrganisationWire } from '#common/helpers/organisation-wire.js'

/**
 * @import {SystemLogsRepository} from '#repositories/system-logs/port.js'
 * @import {OrganisationNumber} from '#domain/organisations/numbers.js'
 */

/**
 * Audit an incremental form migration for an organisation.
 * This is a system-initiated action (no user request context).
 * Logs the full organisation state before and after migration.
 *
 * @param {SystemLogsRepository} systemLogsRepository
 * @param {string} organisationId
 * @param {{ organisationNumber: OrganisationNumber }} previous - Organisation state before migration
 * @param {{ organisationNumber: OrganisationNumber }} next - Organisation state after migration
 */
async function auditIncrementalFormMigration(
  systemLogsRepository,
  organisationId,
  previous,
  next
) {
  const payload = {
    event: {
      category: 'entity',
      subCategory: 'epr-organisations',
      action: 'incremental-form-migration'
    },
    context: {
      organisationId,
      organisationNumber: next.organisationNumber,
      previous: toOrganisationWire(previous),
      next: toOrganisationWire(next)
    },
    user: SYSTEM_USER
  }

  // CDP audit has size limits - send reduced context if too big
  const safeAuditingPayload = isPayloadSmallEnoughToAudit(payload)
    ? payload
    : {
        ...payload,
        context: { organisationId, organisationNumber: next.organisationNumber }
      }

  safeAudit(safeAuditingPayload)

  // System logs have no size limit - always store full state
  await systemLogsRepository.insert({
    createdAt: new Date(),
    createdBy: SYSTEM_USER,
    event: payload.event,
    context: payload.context
  })
}

export { auditIncrementalFormMigration }
