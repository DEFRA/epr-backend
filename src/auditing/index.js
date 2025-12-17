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

  audit(payload)
  await recordSystemLog(request, payload)
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
