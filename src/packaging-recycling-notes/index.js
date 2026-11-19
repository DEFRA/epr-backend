/**
 * PRNs (Packaging Recycling Notes) Module
 *
 * This module contains all domain logic, repositories, and routes for
 * PRNs.
 *
 * @module packaging-recycling-notes
 */

// Domain exports
/** @moduleBoundaryPending */
export { PRN_STATUS, PRN_STATUS_TRANSITIONS } from './domain/model.js'
export { isRelevantYearOpen } from './domain/closed-year.js'

// Application exports
export { getIssuedTonnage } from './application/get-issued-tonnage.js'

// Repository exports
/** @moduleBoundaryPending */
export { createPackagingRecyclingNotesRepository } from './repository/mongodb.js'

// Route exports
/** @moduleBoundaryPending */
export { packagingRecyclingNotesCreate } from './routes/post.js'
/** @moduleBoundaryPending */
export { packagingRecyclingNotesUpdateStatus } from './routes/status.js'
