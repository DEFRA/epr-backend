import {
  extractUserDetails,
  recordSystemLog,
  isPayloadSmallEnoughToAudit,
  safeAudit
} from './helpers.js'

/**
 * @import {SystemLogsRepository} from '#repositories/system-logs/port.js'
 */

/**
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: SystemLogsRepository}} request
 * @param {string} organisationId
 * @param {Object} previous
 * @param {Object} next
 */
async function auditOrganisationUpdate(
  request,
  organisationId,
  previous,
  next
) {
  const payload = {
    event: {
      category: 'entity',
      subCategory: 'epr-organisations',
      action: 'update'
    },
    context: {
      organisationId,
      previous,
      next
    },
    user: extractUserDetails(request)
  }

  const safeAuditingPayload = isPayloadSmallEnoughToAudit(payload)
    ? payload
    : {
        ...payload,
        context: { organisationId }
      }

  safeAudit(safeAuditingPayload)
  await recordSystemLog(request, payload)
}

/**
 * Records a status transition (organisation, registration or accreditation) to
 * the audit log and the system log. The change reason is captured here in the
 * system log payload — it is never written onto the item's statusHistory.
 *
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: SystemLogsRepository}} request
 * @param {{organisationId: string, target: import('#repositories/organisations/port.js').StatusTransitionTarget, previousStatus: string, nextStatus: string, reason: string}} details
 */
async function auditStatusTransition(request, details) {
  const { organisationId, target, previousStatus, nextStatus, reason } = details

  const payload = {
    event: {
      category: 'entity',
      subCategory: 'epr-organisations',
      action: 'status-transition'
    },
    context: { organisationId, target, previousStatus, nextStatus, reason },
    user: extractUserDetails(request)
  }

  safeAudit(payload)
  await recordSystemLog(request, payload)
}

export { auditOrganisationUpdate, auditStatusTransition }
