import { extractUserDetails, recordSystemLog, safeAudit } from './helpers.js'

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
  const event = {
    category: 'entity',
    subCategory: 'epr-organisations',
    action: 'update'
  }
  const user = extractUserDetails(request)

  safeAudit({ event, user }, () => ({ organisationId }))

  await recordSystemLog(request, {
    event,
    context: { organisationId, previous, next },
    user
  })
}

export { auditOrganisationUpdate }
