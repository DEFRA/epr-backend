/**
 * @typedef {Object} UpdateStatusParams
 * @property {string} id - PRN ID
 * @property {import('#packaging-recycling-notes/domain/model.js').PrnStatus} status - New status
 * @property {{ id: string; name: string }} updatedBy - User making the change
 * @property {Date} updatedAt - Timestamp of the change
 * @property {string} [prnNumber] - PRN number to set when issuing (transitioning to awaiting_acceptance)
 * @property {Date} [issuedAt] - Timestamp when the PRN was issued (transitioning to awaiting_acceptance)
 * @property {{ id: string; name: string; position: string }} [issuedBy] - User who issued the PRN
 */

/**
 * @typedef {Object} PackagingRecyclingNotesRepository
 * @property {(id: string) => Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote | null>} findById
 * @property {(prn: Omit<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote, 'id'>) => Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>} create
 * @property {(accreditationId: string) => Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote[]>} findByAccreditation
 * @property {(params: UpdateStatusParams) => Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote | null>} updateStatus
 */

/**
 * @typedef {() => PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
