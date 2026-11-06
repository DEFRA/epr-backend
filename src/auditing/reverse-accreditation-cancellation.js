import {
  isPayloadSmallEnoughToAudit,
  safeAudit,
  SYSTEM_USER
} from './helpers.js'

/**
 * @import {SystemLogsRepository} from '#repositories/system-logs/port.js'
 */

/**
 * Audits a system-initiated reversal of an accreditation's cancellation.
 *
 * @param {SystemLogsRepository} systemLogsRepository
 * @param {{
 *   organisationId: string,
 *   accreditationId: string,
 *   reason: string,
 *   previous: object,
 *   next: object
 * }} context
 */
async function auditReverseAccreditationCancellation(
  systemLogsRepository,
  context
) {
  const { organisationId, accreditationId, reason } = context

  const payload = {
    event: {
      category: 'entity',
      subCategory: 'epr-organisations',
      action: 'reverse-accreditation-cancellation'
    },
    context,
    user: SYSTEM_USER
  }

  safeAudit(
    isPayloadSmallEnoughToAudit(payload)
      ? payload
      : { ...payload, context: { organisationId, accreditationId, reason } }
  )

  await systemLogsRepository.insert({
    createdAt: new Date(),
    createdBy: SYSTEM_USER,
    event: payload.event,
    context
  })
}

export { auditReverseAccreditationCancellation }
