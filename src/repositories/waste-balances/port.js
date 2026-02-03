/**
 * @typedef {Object} DeductAvailableBalanceParams
 * @property {string} accreditationId
 * @property {string} organisationId
 * @property {string} prnId
 * @property {number} tonnage
 * @property {string} userId
 */

/**
 * @typedef {Object} WasteBalancesRepository
 * @property {(accreditationId: string) => Promise<import('#domain/waste-balances/model.js').WasteBalance | null>} findByAccreditationId
 * @property {(accreditationIds: string[]) => Promise<import('#domain/waste-balances/model.js').WasteBalance[]>} findByAccreditationIds
 * @property {(wasteRecords: import('#domain/waste-records/model.js').WasteRecord[], accreditationId: string) => Promise<void>} updateWasteBalanceTransactions
 * @property {(params: DeductAvailableBalanceParams) => Promise<void>} deductAvailableBalanceForPrnCreation
 */

/**
 * @typedef {() => WasteBalancesRepository} WasteBalancesRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
