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
 * @param {string} action
 * @param {object} context
 */
async function auditOverseasSite(request, action, context) {
  const event = {
    category: 'entity',
    subCategory: 'overseas-sites',
    action
  }
  const user = extractUserDetails(request)

  safeAudit({ event, user }, () => context)
  await recordSystemLog(request, { event, context, user })
}

/**
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: SystemLogsRepository}} request
 * @param {object} site
 */
async function auditOverseasSiteCreate(request, site) {
  await auditOverseasSite(request, 'create', { site })
}

/**
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: SystemLogsRepository}} request
 * @param {string} siteId
 * @param {object} previous
 * @param {object} next
 */
async function auditOverseasSiteUpdate(request, siteId, previous, next) {
  const event = {
    category: 'entity',
    subCategory: 'overseas-sites',
    action: 'update'
  }
  const user = extractUserDetails(request)

  safeAudit({ event, user }, () => ({ siteId }))
  await recordSystemLog(request, {
    event,
    context: { siteId, previous, next },
    user
  })
}

/**
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: SystemLogsRepository}} request
 * @param {string} siteId
 * @param {object} site
 */
async function auditOverseasSiteDelete(request, siteId, site) {
  await auditOverseasSite(request, 'delete', { siteId, site })
}

/**
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: SystemLogsRepository}} request
 * @param {string} importId
 */
async function auditOverseasSiteImport(request, importId) {
  await auditOverseasSite(request, 'import-initiated', { importId })
}

export {
  auditOverseasSiteCreate,
  auditOverseasSiteUpdate,
  auditOverseasSiteDelete,
  auditOverseasSiteImport
}
