import { audit } from '@defra/cdp-auditing'

/**
 * @import {SystemLogsRepository} from '#repositories/system-logs/port.js'
 */

/**
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: SystemLogsRepository}} request
 */
async function auditOrganisationUpdate(request, { organisationId, details }) {
  const payload = {
    event: {
      category: 'organisation',
      action: 'update'
    },
    context: {
      user: extractUserDetails(request),
      organisationId,
      ...details
    }
  }

  audit(payload)
  await recordSystemLog(request.systemLogsRepository, payload)
}

function extractUserDetails(request) {
  return request.auth?.credentials
    ? {
        id: request.auth.credentials.id,
        email: request.auth.credentials.email,
        scope: request.auth.credentials.scope
      }
    : undefined
}

async function recordSystemLog(systemLogsRepository, payload) {
  systemLogsRepository.insert({
    createdAt: new Date(),
    ...payload
  })
}

export { auditOrganisationUpdate }
