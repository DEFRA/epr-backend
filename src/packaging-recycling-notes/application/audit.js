import {
  extractUserDetails,
  recordSystemLog,
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

  const event = {
    category: 'waste-reporting',
    subCategory: 'packaging-recycling-notes',
    action: 'status-transition'
  }
  const user = extractUserDetails(request)

  safeAudit({ event, user }, () => ({ organisationId, prnId }))
  await recordSystemLog(request, {
    event,
    context: { organisationId, prnId, previous, next },
    user
  })
}

export { auditPrnStatusTransition }
