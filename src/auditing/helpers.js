import { audit } from '@defra/cdp-auditing'
import { logger } from '#common/helpers/logging/logger.js'
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

/**
 * Safety-net wrapper around CDP audit. Calls the factory to build audit context,
 * assembles the payload, and sends it. If the assembled payload is too large,
 * strips context and sends event + user only, logging a warning.
 * @param {{ event: object, user?: object }} options
 * @param {() => object} buildAuditContext - factory that builds audit-specific context
 */
function safeAudit({ event, user }, buildAuditContext) {
  const context = buildAuditContext()
  const payload = { event, ...(user && { user }), ...(context && { context }) }

  if (isPayloadSmallEnoughToAudit(payload)) {
    audit(payload)
    return
  }

  const { category, subCategory, action } = event
  logger.warn({
    message: `Audit payload too large, stripping context for ${category}/${subCategory}/${action}`
  })

  const reducedPayload = { event }
  if (user) {
    reducedPayload.user = user
  }
  audit(reducedPayload)
}

export { extractUserDetails, recordSystemLog, safeAudit }
