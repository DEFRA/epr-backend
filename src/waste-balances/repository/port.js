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
 * @typedef {Object} FlipCanonicalSourceToLedgerParams
 * @property {string} accreditationId
 * @property {number} capturedVersion - The `version` observed on the embedded
 *   doc at the start of a per-accreditation rebuild. The flip only succeeds
 *   when the live document's `version` still matches; any concurrent embedded
 *   write between capture and flip bumps `version`, the filter no-ops, and the
 *   marker stays `'embedded'`.
 */

/**
 * @typedef {{ canonicalSource: import('../domain/model.js').WasteBalanceCanonicalSource } | null} FlipCanonicalSourceToLedgerResult
 *   Post-state of the accreditation's balance document.
 *
 *   - `{ canonicalSource: 'ledger' }` — the doc is on the ledger now (this call
 *     promoted it, or a prior call already did).
 *   - `{ canonicalSource: 'embedded' }` — the flip did not land; a concurrent
 *     write bumped `version` between capture and flip and the marker stays put.
 *   - `null` — no balance document exists for this accreditation.
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
 * @property {(params: FlipCanonicalSourceToLedgerParams) => Promise<FlipCanonicalSourceToLedgerResult>} flipCanonicalSourceToLedger
 *   Promote an `'embedded'` accreditation to `'ledger'`, gated on `version`
 *   matching the captured value. The filter is `{ accreditationId, version:
 *   capturedVersion, canonicalSource: 'embedded' }` so the call strictly
 *   promotes — never demotes. Returns the post-state, mirroring the persisted
 *   marker vocabulary, so callers can distinguish the four outcomes:
 *
 *   - filter matched and the marker just flipped → `{ canonicalSource: 'ledger' }`
 *   - already on the ledger when called → `{ canonicalSource: 'ledger' }`
 *   - concurrent embedded write bumped `version` → `{ canonicalSource: 'embedded' }`
 *   - no balance document for this accreditation → `null`
 *
 *   Used as the final step of a per-accreditation rebuild after authoritative
 *   history has been replayed into the ledger.
 */

/**
 * @typedef {() => WasteBalancesRepository} WasteBalancesRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
