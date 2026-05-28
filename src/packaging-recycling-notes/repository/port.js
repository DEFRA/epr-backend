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
 * @property {number} version - Expected current document version (compare-and-set token for OCC)
 * @property {import('#packaging-recycling-notes/domain/model.js').PrnStatus} status - New status
 * @property {{ id: string; name: string }} updatedBy - User making the change
 * @property {Date} updatedAt - Timestamp of the change
 * @property {string} [prnNumber] - PRN number to set when issuing (transitioning to awaiting_acceptance)
 * @property {{ slot: import('#packaging-recycling-notes/domain/model.js').BusinessOperationSlot; at: Date; by: import('#packaging-recycling-notes/domain/model.js').Actor }} [operation] - Business operation to record on the status object
 * @property {number} [lastAppliedEventNumber] - Stream watermark to stamp on the projection; the sequence number of the latest waste-balance event folded into this PRN. Enforced monotonic: once a PRN carries a watermark it has migrated to ledger-event status tracking, so every write must carry one forward (equal or higher). A lower or dropped watermark cannot be a lost race, only a coding error, so it is rejected as a 500 internal error. A PRN that has never carried a watermark may omit it (the pre-migration path).
 */

/**
 * @typedef {Object} FindByStatusParams
 * @property {import('#packaging-recycling-notes/domain/model.js').PrnStatus[]} statuses
 * @property {Date} [dateFrom]
 * @property {Date} [dateTo]
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
 * Reverses a forward status transition that has already been committed by
 * updateStatus, when a follow-on side-effect failed and the document needs
 * to be returned to its prior state.
 *
 * @typedef {Object} RollbackParams
 * @property {string} id - PRN ID
 * @property {number} expectedVersion - Document version after the forward write (CAS gate)
 * @property {{ id: string; name: string }} updatedBy - Actor recorded against the rollback history entry
 * @property {Date} updatedAt - Timestamp of the rollback
 * @property {number} [lastAppliedEventNumber] - Stream watermark to carry forward; subject to the same monotonic guard as updateStatus. A migrated PRN (one that already carries a watermark) must carry one on its rollback too; a PRN that has never carried one may omit it.
 */

/**
 * Save a fully projected PRN document with optimistic concurrency. The
 * projection is constructed at the application layer (typically by folding
 * stream events onto the prior PRN); the repository performs no projection
 * logic itself.
 *
 * @typedef {Object} PersistProjectionParams
 * @property {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} projection - Fully projected PRN document to persist.
 * @property {number} expectedVersion - The version of the PRN before this projection step; the CAS gate.
 */

/**
 * @typedef {Object} PackagingRecyclingNotesRepository
 * @property {(id: string) => Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote | null>} findById
 * @property {(prnNumber: string) => Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote | null>} findByPrnNumber
 * @property {(prn: Omit<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote, 'id'>) => Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>} create
 * @property {(accreditationId: string) => Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote[]>} findByAccreditation
 * @property {(params: FindByStatusParams) => Promise<PaginatedResult>} findByStatus
 * @property {(params: UpdateStatusParams) => Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote | null>} updateStatus
 * @property {(params: PersistProjectionParams) => Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote | null>} persistProjection
 * @property {(params: RollbackParams) => Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote | null>} rollbackIssuance
 * @property {(params: RollbackParams) => Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote | null>} rollbackPendingCancellation
 * @property {(params: RollbackParams) => Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote | null>} rollbackIssuedCancellation
 */

/**
 * @typedef {(logger: import('#common/hapi-types.js').TypedLogger) => PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
