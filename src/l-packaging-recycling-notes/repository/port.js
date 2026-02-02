/**
 * @typedef {Object} UpdateStatusParams
 * @property {string} id - PRN ID
 * @property {import('#l-packaging-recycling-notes/domain/model.js').PrnStatus} status - New status
 * @property {string} updatedBy - User ID making the change
 * @property {Date} updatedAt - Timestamp of the change
 */

/**
 * @typedef {Object} PackagingRecyclingNotesRepository
 * @property {(id: string) => Promise<import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote | null>} findById
 * @property {(prn: Omit<import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote, 'id'>) => Promise<import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>} create
 * @property {(registrationId: string) => Promise<import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote[]>} findByRegistration
 * @property {(params: UpdateStatusParams) => Promise<import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote | null>} updateStatus
 */

/**
 * @typedef {() => PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
