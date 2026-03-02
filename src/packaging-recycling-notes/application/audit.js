import {
  extractUserDetails,
  recordSystemLog,
  isPayloadSmallEnoughToAudit,
  safeAudit
} from '#root/auditing/helpers.js'

/**
 * @import {SystemLogsRepository} from '#repositories/system-logs/port.js'
 */

/**
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: SystemLogsRepository}} request
 * @param {string} prnId
 * @param {Object} previous
 * @param {Object} next
 */
async function auditPrnStatusTransition(request, prnId, previous, next) {
  const organisationId = next.organisation?.id

  const payload = {
    event: {
      category: 'waste-reporting',
      subCategory: 'packaging-recycling-notes',
      action: 'status-transition'
    },
    context: {
      organisationId,
      prnId,
      previous,
      next
    },
    user: extractUserDetails(request)
  }

  const safeAuditingPayload = isPayloadSmallEnoughToAudit(payload)
    ? payload
    : {
        ...payload,
        context: { organisationId, prnId }
      }

  safeAudit(safeAuditingPayload)
  await recordSystemLog(request, payload)
}

export { auditPrnStatusTransition }
