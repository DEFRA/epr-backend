import {
  extractUserDetails,
  recordSystemLog,
  isPayloadSmallEnoughToAudit,
  safeAudit
} from '#root/auditing/helpers.js'

/**
 * @import {SystemLogsRepository} from '#repositories/system-logs/port.js'
 * @import {PackagingRecyclingNote} from '#packaging-recycling-notes/domain/model.js'
 */

/**
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: SystemLogsRepository}} request
 * @param {string} prnId
 * @param {PackagingRecyclingNote} previous
 * @param {PackagingRecyclingNote} next
 */
async function auditPrnStatusTransition(request, prnId, previous, next) {
  const numbers = {
    organisationNumber: next.organisation.organisationNumber,
    registrationNumber: next.registration.registrationNumber,
    accreditationNumber: next.accreditation.accreditationNumber
  }

  const payload = {
    event: {
      category: 'waste-reporting',
      subCategory: 'packaging-recycling-notes',
      action: 'status-transition'
    },
    context: {
      ...numbers,
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
        context: { ...numbers, prnId }
      }

  safeAudit(safeAuditingPayload)
  await recordSystemLog(request, payload)
}

export { auditPrnStatusTransition }
