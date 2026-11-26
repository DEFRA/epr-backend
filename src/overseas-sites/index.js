/**
 * Overseas sites
 *
 * Stores the overseas reprocessing sites that exporters send waste to, and
 * imports them from ORS spreadsheets. Its README names the module's entry
 * points.
 *
 * @module overseas-sites
 */

export { ORS_IMPORT_COMMAND } from './domain/import-status.js'
export { isOrsApprovedAtDate } from './domain/approval.js'
export { resolveOverseasSiteDetails } from './application/resolve-overseas-site-details.js'

/** @typedef {import('./application/resolve-overseas-site-details.js').OverseasSiteDetail} OverseasSiteDetail */
/** @typedef {import('./imports/repository/port.js').OrsImportsRepository} OrsImportsRepository */
/** @typedef {import('./imports/worker/port.js').OrsImportsCommandExecutor} OrsImportsCommandExecutor */
/** @typedef {import('./repository/port.js').OverseasSite} OverseasSite */
/** @typedef {import('./repository/port.js').OverseasSiteAddress} OverseasSiteAddress */
/** @typedef {import('./repository/port.js').OverseasSitesRepository} OverseasSitesRepository */
