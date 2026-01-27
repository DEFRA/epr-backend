/**
 * @typedef {Object} PackagingRecyclingNotesRepository
 * @property {(id: string) => Promise<import('#domain/prn/model.js').PackagingRecyclingNote | null>} findById
 * @property {(prn: Omit<import('#domain/prn/model.js').PackagingRecyclingNote, 'id'>) => Promise<import('#domain/prn/model.js').PackagingRecyclingNote>} create
 * @property {(organisationId: string) => Promise<import('#domain/prn/model.js').PackagingRecyclingNote[]>} findByOrganisation
 */

/**
 * @typedef {() => PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
