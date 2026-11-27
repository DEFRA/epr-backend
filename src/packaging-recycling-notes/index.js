/**
 * Packaging recycling notes
 *
 * Creates PRNs, moves them through their statuses and serves them, with the
 * tonnage they issue. Its README names the module's entry points.
 *
 * @module packaging-recycling-notes
 */

export { PRN_STATUS } from './domain/model.js'
export { isRelevantYearOpen } from './domain/closed-year.js'
export { getIssuedTonnage } from './application/get-issued-tonnage.js'

/** @typedef {import('./application/prn-events.plugin.js').PrnEvents} PrnEvents */
/** @typedef {import('./domain/model.js').PackagingRecyclingNote} PackagingRecyclingNote */
/** @typedef {import('./domain/model.js').PrnStatus} PrnStatus */
/** @typedef {import('./repository/port.js').FindByIdsParams} FindByIdsParams */
/** @typedef {import('./repository/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository */
