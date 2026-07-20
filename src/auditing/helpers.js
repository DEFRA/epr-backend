import { audit } from '@defra/cdp-auditing'
import { logger } from '#common/helpers/logging/logger.js'
import { config } from '#root/config.js'

/**
 * @import {HumanCredentials, MachineCredentials} from '#common/hapi-types.js'
 * @import {SystemLog, SystemLogActor, SystemLogHumanActor, SystemLogsRepository} from '#repositories/system-logs/port.js'
 */

/**
 * The actor recorded for system-initiated actions that have no user request
 * context (migrations, background jobs).
 * @type {SystemLogHumanActor}
 */
export const SYSTEM_USER = Object.freeze({
  id: 'system',
  email: 'system',
  scope: [],
  role: null
})

/**
 * @typedef {Omit<SystemLog, 'createdAt' | 'createdBy'> & { user: SystemLogActor }} SystemLogInput
 */

/**
 * @typedef {{
 *   context?: object
 *   event: { action: string, category: string, subCategory?: string }
 *   user?: SystemLogActor
 * }} AuditPayload
 */

/**
 * @param {import('#common/hapi-types.js').HapiRequest} request
 * @returns {SystemLogActor}
 */
function extractUserDetails(request) {
  /** @type {MachineCredentials | HumanCredentials} */
  const credentials = request.auth.credentials
  return 'isMachine' in credentials
    ? {
        id: credentials.id,
        name: credentials.name
      }
    : {
        id: credentials.id,
        email: credentials.email,
        scope: credentials.scope,
        role: credentials.role
      }
}

/**
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: SystemLogsRepository}} request
 * @param {SystemLogInput} payload
 */
async function recordSystemLog(request, { user, ...restPayload }) {
  return request.systemLogsRepository.insert({
    createdAt: new Date(),
    createdBy: user,
    ...restPayload
  })
}

/**
 * Batch analogue of {@link recordSystemLog} for system-triggered audits (no Hapi request available).
 * Uses {@link SystemLogsRepository.insertMany} for a single DB round-trip.
 *
 * @param {SystemLogsRepository} systemLogsRepository
 * @param {SystemLogInput[]} payloads
 */
async function recordSystemLogs(systemLogsRepository, payloads) {
  const records = payloads.map(({ user, ...restPayload }) => ({
    createdAt: new Date(),
    createdBy: user,
    ...restPayload
  }))

  await systemLogsRepository.insertMany(records)
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
 * Safety-net wrapper around CDP audit. Passes small payloads through unchanged.
 * For oversized payloads, logs a warning and sends a stripped payload (event + user only)
 * so the audit event is still recorded without risking log pipeline fragmentation.
 * @param {AuditPayload} payload
 */
function safeAudit(payload) {
  if (isPayloadSmallEnoughToAudit(payload)) {
    audit(payload)
    return
  }

  const { category, subCategory, action } = payload.event
  logger.warn({
    message: `Audit payload too large, stripping context for ${category}/${subCategory}/${action}`
  })

  /** @type {AuditPayload} */
  const reducedPayload = { event: payload.event }
  if (payload.user) {
    reducedPayload.user = payload.user
  }
  audit(reducedPayload)
}

export {
  extractUserDetails,
  isPayloadSmallEnoughToAudit,
  recordSystemLog,
  recordSystemLogs,
  safeAudit
}
