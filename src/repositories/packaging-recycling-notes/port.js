/**
 * @typedef {Object} UpdateStatusParams
 * @property {string} id - PRN ID
 * @property {import('#domain/prn/model.js').PrnStatus} status - New status
 * @property {string} updatedBy - User ID making the change
 * @property {Date} updatedAt - Timestamp of the change
 */

/**
 * @typedef {Object} PackagingRecyclingNotesRepository
 * @property {(id: string) => Promise<import('#domain/prn/model.js').PackagingRecyclingNote | null>} findById
 * @property {(prn: Omit<import('#domain/prn/model.js').PackagingRecyclingNote, 'id'>) => Promise<import('#domain/prn/model.js').PackagingRecyclingNote>} create
 * @property {(organisationId: string) => Promise<import('#domain/prn/model.js').PackagingRecyclingNote[]>} findByOrganisation
 * @property {(registrationId: string) => Promise<import('#domain/prn/model.js').PackagingRecyclingNote[]>} findByRegistration
 * @property {(params: UpdateStatusParams) => Promise<import('#domain/prn/model.js').PackagingRecyclingNote | null>} updateStatus
 */

/**
 * @typedef {() => PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
