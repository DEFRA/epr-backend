/**
 * @typedef {Object} WasteBalancesRepository
 * @property {(accreditationId: string) => Promise<import('#domain/waste-balances/model.js').WasteBalance | null>} findByAccreditationId
 * @property {(accreditationIds: string[]) => Promise<import('#domain/waste-balances/model.js').WasteBalance[]>} findByAccreditationIds
 * @property {(wasteRecords: import('#domain/waste-records/model.js').WasteRecord[], accreditationId: string, user?: Object) => Promise<void>} updateWasteBalanceTransactions
 */

/**
 * @typedef {() => WasteBalancesRepository} WasteBalancesRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
