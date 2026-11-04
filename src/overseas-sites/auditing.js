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
  const payload = {
    event: {
      category: 'entity',
      subCategory: 'overseas-sites',
      action
    },
    context,
    user: extractUserDetails(request)
  }

  safeAudit(payload)
  await recordSystemLog(request, payload)
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
  auditOverseasSiteDelete,
  auditOverseasSiteImport
}
