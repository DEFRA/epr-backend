import { config } from '#root/config.js'

/**
 * @import {SystemLogsRepository} from '#repositories/system-logs/port.js'
 */

/**
 * @param {import('#common/hapi-types.js').HapiRequest} request
 */
function extractUserDetails(request) {
  return request.auth?.credentials?.isMachine
    ? {
        id: request.auth.credentials.id,
        name: request.auth.credentials.name
      }
    : {
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

/**
 * Check if payload is small enough for CDP auditing library.
 * Large payloads cause errors and the audit event is lost.
 * @param {object} payload
 * @returns {boolean}
 */
function isPayloadSmallEnoughToAudit(payload) {
  const payloadSize = Buffer.byteLength(JSON.stringify(payload), 'utf8')
  return payloadSize < config.get('audit.maxPayloadSizeBytes')
}

export { extractUserDetails, isPayloadSmallEnoughToAudit, recordSystemLog }
