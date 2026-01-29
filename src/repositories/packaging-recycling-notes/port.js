/**
 * @typedef {Object} PackagingRecyclingNotesRepository
 * @property {(id: string, prn: Object) => Promise<void>} insert
 * @property {(id: string) => Promise<Object>} findById
 * @property {(accreditationId: string) => Promise<Array<Object>>} findByAccreditationId
 */

/**
 * @typedef {() => PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
