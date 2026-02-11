/**
 * PRNs (Packaging Recycling Notes) Module
 *
 * This module contains all domain logic, repositories, and routes for
 * PRNs.
 *
 * @module packaging-recycling-notes
 */

// Domain exports
export { PRN_STATUS, PRN_STATUS_TRANSITIONS } from './domain/model.js'

// Repository exports
export { createPackagingRecyclingNotesRepository } from './repository/mongodb.js'

// Route exports
export { packagingRecyclingNotesList } from './routes/get.js'
export { packagingRecyclingNoteById } from './routes/get-by-id.js'
export { packagingRecyclingNotesCreate } from './routes/post.js'
export { packagingRecyclingNotesUpdateStatus } from './routes/status.js'
