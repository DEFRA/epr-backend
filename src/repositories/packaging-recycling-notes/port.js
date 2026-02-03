/** @typedef {import('#domain/packaging-recycling-notes/model.js').PackagingRecyclingNote} PackagingRecyclingNote */

/**
 * @typedef {Object} PackagingRecyclingNotesRepository
 * @property {(id: string, prn: PackagingRecyclingNote) => Promise<void>} insert
 * @property {(id: string) => Promise<PackagingRecyclingNote | null>} findById
 * @property {(accreditationId: string) => Promise<Array<PackagingRecyclingNote>>} findByAccreditationId
 */

/**
 * @typedef {() => PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
