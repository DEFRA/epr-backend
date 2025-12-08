/**
 * @typedef {Object} WasteBalancesRepository
 * @property {(accreditationId: string) => Promise<import('#domain/waste-records/model.js').WasteBalance | null>} findByAccreditationId
 */

/**
 * @typedef {() => WasteBalancesRepository} WasteBalancesRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
