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
 * Tags the `Boom.conflict` an implementation raises when a write asserts a
 * document version another writer has already moved. The message on that error
 * names the two versions and is written for the logs; a write route recognises
 * the tag and answers the client in its own words.
 */
export const PRN_VERSION_CONFLICT = 'prn-version-conflict'

/**
 * The identity of an accreditation: the accreditation, and the registration and
 * organisation above it. A PRN belongs to an accreditation, so selecting the
 * PRNs of one names the whole chain. `RegistrationOrAccreditationId` with its
 * `accreditationId` narrowed non-null — a registration in its registered-only
 * phase has no accreditation to name.
 *
 * @typedef {import('#waste-balances/repository/ledger-schema.js').RegistrationOrAccreditationId & { accreditationId: string }} AccreditationId
 */

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
 * Advance a projection's stream watermark and nothing else. Unlike
 * `updateStatus`, it writes no status, history, `updatedAt` or `updatedBy`: it
 * exists to bring a benign watermark-behind projection (status already correct,
 * watermark never stamped) current without the churn a full fold would inflict.
 * The watermark is enforced monotonic and the write is gated by the version CAS,
 * exactly as the other writes.
 *
 * @typedef {Object} UpdateWatermarkParams
 * @property {string} id - PRN ID
 * @property {number} version - Expected current document version (compare-and-set token for OCC)
 * @property {number} lastAppliedEventNumber - Stream watermark to stamp; must be greater than or equal to any watermark the PRN already carries
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
 * Names the notes a ledger read wants, scoped to the accreditation whose ledger
 * it is reading. The scope is what keeps a note belonging to another
 * accreditation from being read here, so it is required rather than optional.
 *
 * @typedef {Object} FindByIdsParams
 * @property {string} organisationId
 * @property {string} registrationId
 * @property {string} accreditationId
 * @property {string[]} ids
 */

/**
 * @typedef {Object} PaginatedResult
 * @property {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote[]} items
 * @property {string | null} nextCursor
 * @property {boolean} hasMore
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
 * @property {(accreditationId: AccreditationId) => Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote[]>} findByAccreditation
 * @property {(params: FindByIdsParams) => Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote[]>} findByIds
 * @property {(params: FindByStatusParams) => Promise<PaginatedResult>} findByStatus
 * @property {(params: UpdateStatusParams) => Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote | null>} updateStatus
 * @property {(params: UpdateWatermarkParams) => Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote | null>} updateWatermark
 * @property {(params: PersistProjectionParams) => Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote | null>} persistProjection
 */

/**
 * @typedef {(logger: import('#common/hapi-types.js').TypedLogger) => PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
