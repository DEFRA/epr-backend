import { audit } from '@defra/cdp-auditing'

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

  audit(
    modifiedIfTooBig(payload, ({ context, ...restPayload }) => ({
      ...restPayload,
      context: { organisationId: context.organisationId }
    }))
  )
  await recordSystemLog(request, payload)
}

// Prevent sending large auditing payloads to CDP library (as this causes an error and the audit event is lost)
function modifiedIfTooBig(payload, modify) {
  const payloadSize = Buffer.byteLength(JSON.stringify(payload), 'utf8')
  const threshold = Math.pow(1024, 2) // 1Mb
  return payloadSize < threshold ? payload : modify(payload)
}

function extractUserDetails(request) {
  return {
    id: request.auth?.credentials?.id,
    email: request.auth?.credentials?.email,
    scope: request.auth?.credentials?.scope
  }
}

/**
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: SystemLogsRepository}} request
 * @param {object} payload
 */
async function recordSystemLog(request, { user, ...restPayload }) {
  return request.systemLogsRepository.insert({
    createdAt: new Date(),
    createdBy: user,
    ...restPayload
  })
}

export { auditOrganisationUpdate }
