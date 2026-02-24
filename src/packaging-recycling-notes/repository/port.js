/**
 * Error thrown when a PRN number already exists in the database.
 * Callers can catch this to retry with a different PRN number.
 */
export class PrnNumberConflictError extends Error {
  constructor(prnNumber) {
    super(`PRN number already exists: ${prnNumber}`)
    this.name = 'PrnNumberConflictError'
    this.prnNumber = prnNumber
  }
}

/**
 * @typedef {Object} UpdateStatusParams
 * @property {string} id - PRN ID
 * @property {import('#packaging-recycling-notes/domain/model.js').PrnStatus} status - New status
 * @property {{ id: string; name: string }} updatedBy - User making the change
 * @property {Date} updatedAt - Timestamp of the change
 * @property {string} [prnNumber] - PRN number to set when issuing (transitioning to awaiting_acceptance)
 * @property {{ slot: import('#packaging-recycling-notes/domain/model.js').BusinessOperationSlot; at: Date; by: import('#packaging-recycling-notes/domain/model.js').Actor }} [operation] - Business operation to record on the status object
 */

/**
 * @typedef {Object} FindByStatusParams
 * @property {import('#packaging-recycling-notes/domain/model.js').PrnStatus[]} statuses
 * @property {Date} [dateFrom]
 * @property {Date} [dateTo]
 * @property {string[]} [excludeOrganisationIds]
 * @property {string} [cursor]
 * @property {number} limit
 */

/**
 * @typedef {Object} PaginatedResult
 * @property {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote[]} items
 * @property {string | null} nextCursor
 * @property {boolean} hasMore
 */

/**
 * @typedef {Object} PackagingRecyclingNotesRepository
 * @property {(id: string) => Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote | null>} findById
 * @property {(prnNumber: string) => Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote | null>} findByPrnNumber
 * @property {(prn: Omit<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote, 'id'>) => Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>} create
 * @property {(accreditationId: string) => Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote[]>} findByAccreditation
 * @property {(params: FindByStatusParams) => Promise<PaginatedResult>} findByStatus
 * @property {(params: UpdateStatusParams) => Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote | null>} updateStatus
 */

/**
 * @typedef {() => PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
