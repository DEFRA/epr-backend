/**
 * @typedef {Object} DeductAvailableBalanceParams
 * @property {string} accreditationId
 * @property {string} organisationId
 * @property {string} prnId
 * @property {number} tonnage
 * @property {string} userId
 */

/**
 * @typedef {Object} DeductTotalBalanceParams
 * @property {string} accreditationId
 * @property {string} organisationId
 * @property {string} prnId
 * @property {number} tonnage
 * @property {string} userId
 */

/**
 * @typedef {Object} CreditAvailableBalanceParams
 * @property {string} accreditationId
 * @property {string} organisationId
 * @property {string} prnId
 * @property {number} tonnage
 * @property {string} userId
 */

/**
 * @typedef {Object} CreditFullBalanceParams
 * @property {string} accreditationId
 * @property {string} organisationId
 * @property {string} prnId
 * @property {number} tonnage
 * @property {string} userId
 */

/**
 * @typedef {Object} RoundingCorrectionParams
 * @property {string} accreditationId
 * @property {number} correctedAmount - The exact corrected total amount (post-fix)
 * @property {number} correctedAvailableAmount - The exact corrected available amount (post-fix)
 */

/**
 * @typedef {Object} WasteBalancesRepository
 * @property {(accreditationId: string) => Promise<import('#domain/waste-balances/model.js').WasteBalance | null>} findByAccreditationId
 * @property {(accreditationIds: string[]) => Promise<import('#domain/waste-balances/model.js').WasteBalance[]>} findByAccreditationIds
 * @property {() => Promise<import('#domain/waste-balances/model.js').WasteBalance[]>} findAll
 * @property {(wasteRecords: import('#domain/waste-records/model.js').WasteRecord[], accreditationId: string, user?: Object) => Promise<void>} updateWasteBalanceTransactions
 * @property {(params: DeductAvailableBalanceParams) => Promise<void>} deductAvailableBalanceForPrnCreation
 * @property {(params: DeductTotalBalanceParams) => Promise<void>} deductTotalBalanceForPrnIssue
 * @property {(params: CreditAvailableBalanceParams) => Promise<void>} creditAvailableBalanceForPrnCancellation
 * @property {(params: CreditFullBalanceParams) => Promise<void>} creditFullBalanceForIssuedPrnCancellation
 * @property {(params: RoundingCorrectionParams) => Promise<void>} applyRoundingCorrectionToWasteBalance
 */

/**
 * @typedef {() => WasteBalancesRepository} WasteBalancesRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
