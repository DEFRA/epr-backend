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
 * @typedef {Object} FlipCanonicalSourceToV2Params
 * @property {string} accreditationId
 * @property {number} capturedVersion - The `version` observed on the v1 doc at
 *   the start of a per-accreditation rebuild. The flip only succeeds when the
 *   live document's `version` still matches; any concurrent v1 write between
 *   capture and flip bumps `version`, the filter no-ops, and the marker stays
 *   `'v1'`.
 */

/**
 * @typedef {Object} FlipCanonicalSourceToV2Result
 * @property {boolean} flipped - `true` when the document was updated; `false`
 *   when no document matched (either no balance exists or the captured version
 *   is stale).
 */

/**
 * @typedef {Object} WasteBalancesRepository
 * @property {(accreditationId: string) => Promise<import('../domain/model.js').WasteBalance | null>} findByAccreditationId
 * @property {(accreditationIds: string[]) => Promise<import('../domain/model.js').WasteBalance[]>} findByAccreditationIds
 * @property {(wasteRecords: import('#domain/waste-records/model.js').WasteRecord[], options: { user: import('#domain/summary-logs/worker/port.js').SubmitUser, accreditation: import('#domain/organisations/accreditation.js').Accreditation, overseasSites: import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext }) => Promise<void>} updateWasteBalanceTransactions
 * @property {(params: DeductAvailableBalanceParams) => Promise<void>} deductAvailableBalanceForPrnCreation
 * @property {(params: DeductTotalBalanceParams) => Promise<void>} deductTotalBalanceForPrnIssue
 * @property {(params: CreditAvailableBalanceParams) => Promise<void>} creditAvailableBalanceForPrnCancellation
 * @property {(params: CreditFullBalanceParams) => Promise<void>} creditFullBalanceForIssuedPrnCancellation
 * @property {(params: FlipCanonicalSourceToV2Params) => Promise<FlipCanonicalSourceToV2Result>} flipCanonicalSourceToV2
 *   Atomically set `canonicalSource` to `'v2'` for an accreditation, gated on
 *   `version` matching the captured value. Used as the final step of a
 *   per-accreditation rebuild after authoritative history has been replayed
 *   into the ledger; the version filter ensures concurrent v1 writes abort
 *   the flip rather than corrupting the marker.
 */

/**
 * @typedef {() => WasteBalancesRepository} WasteBalancesRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
