/**
 * @typedef {Object} DeductAvailableBalanceParams
 * @property {string} accreditationId
 * @property {string} registrationId
 * @property {string} organisationId
 * @property {string} prnId
 * @property {number} tonnage
 * @property {string} userId
 */

/**
 * @typedef {Object} DeductTotalBalanceParams
 * @property {string} accreditationId
 * @property {string} registrationId
 * @property {string} organisationId
 * @property {string} prnId
 * @property {number} tonnage
 * @property {string} userId
 */

/**
 * @typedef {Object} CreditAvailableBalanceParams
 * @property {string} accreditationId
 * @property {string} registrationId
 * @property {string} organisationId
 * @property {string} prnId
 * @property {number} tonnage
 * @property {string} userId
 */

/**
 * @typedef {Object} CreditFullBalanceParams
 * @property {string} accreditationId
 * @property {string} registrationId
 * @property {string} organisationId
 * @property {string} prnId
 * @property {number} tonnage
 * @property {string} userId
 */

/**
 * @typedef {Object} FlipCanonicalSourceToMigratingParams
 * @property {string} accreditationId
 * @property {number} capturedVersion - The `version` observed on the embedded
 *   doc at the start of a per-accreditation rebuild. The flip only succeeds
 *   when the live document's `version` still matches; any concurrent embedded
 *   write between capture and flip bumps `version`, the filter no-ops, and the
 *   marker stays `'embedded'`.
 */

/**
 * @typedef {{ canonicalSource: import('../domain/model.js').WasteBalanceCanonicalSource } | null} FlipCanonicalSourceToMigratingResult
 *   Post-state of the accreditation's balance document. The result mirrors the
 *   persisted vocabulary so callers can distinguish:
 *
 *   - `{ canonicalSource: 'migrating' }` — either this call promoted an
 *     `'embedded'` doc to `'migrating'`, or the doc was already `'migrating'`.
 *   - `{ canonicalSource: 'embedded' }` — the flip did not land; a concurrent
 *     write bumped `version` between capture and flip and the marker stays put.
 *   - `{ canonicalSource: 'ledger' }` — the doc is already on the ledger and
 *     never demotes; the flip is a no-op.
 *   - `null` — no balance document exists for this accreditation.
 */

/**
 * @typedef {Object} FlipCanonicalSourceToLedgerParams
 * @property {string} accreditationId
 * @property {number} capturedVersion - The `version` observed on the
 *   `'migrating'` doc at the start of step 3 of a per-accreditation rebuild
 *   (after authoritative history has been replayed into the ledger). The flip
 *   only succeeds when the live document's `version` still matches; any
 *   concurrent PRN write that landed during the replay bumps `version`, the
 *   filter no-ops, and the marker stays `'migrating'` so the rebuild can retry.
 */

/**
 * @typedef {{ canonicalSource: import('../domain/model.js').WasteBalanceCanonicalSource } | null} FlipCanonicalSourceToLedgerResult
 *   Post-state of the accreditation's balance document.
 *
 *   - `{ canonicalSource: 'ledger' }` — the doc is on the ledger now (this call
 *     promoted it, or a prior call already did).
 *   - `{ canonicalSource: 'migrating' }` — the flip did not land; a concurrent
 *     write bumped `version` between capture and flip and the marker stays put.
 *   - `{ canonicalSource: 'embedded' }` — caller invoked the flip before the
 *     embedded → migrating step, or after a stuck-marker reset; embedded never
 *     promotes directly to ledger.
 *   - `null` — no balance document exists for this accreditation.
 */

/**
 * @typedef {Object} ResetCanonicalSourceToEmbeddedParams
 * @property {string} accreditationId
 */

/**
 * @typedef {Object} GetPrnCatchupEventsParams
 * @property {string} registrationId
 * @property {string} accreditationId
 * @property {string} prnId
 * @property {number} afterEventNumber - The watermark to fold past. Pass
 *   `lastAppliedEventNumber ?? 0` so the first event of a first-event-failure
 *   case (where no watermark was ever stamped onto the PRN doc) is still
 *   returned.
 */

/**
 * @typedef {{ canonicalSource: import('../domain/model.js').WasteBalanceCanonicalSource } | null} ResetCanonicalSourceToEmbeddedResult
 *   Post-state of the accreditation's balance document.
 *
 *   - `{ canonicalSource: 'embedded' }` — either this call reset a stuck
 *     `'migrating'` doc, or the doc was already `'embedded'`. `migratingSince`
 *     is cleared.
 *   - `{ canonicalSource: 'ledger' }` — the doc is on the ledger and never
 *     demotes; the reset is a no-op.
 *   - `null` — no balance document exists for this accreditation.
 */

/**
 * @typedef {Object} WasteBalancesRepository
 * @property {(accreditationId: string) => Promise<import('../domain/model.js').WasteBalance | null>} findByAccreditationId
 * @property {(accreditationIds: string[]) => Promise<import('../domain/model.js').WasteBalance[]>} findByAccreditationIds
 * @property {(wasteRecords: import('#domain/waste-records/model.js').WasteRecord[], options: { user: import('#domain/summary-logs/worker/port.js').SubmitUser, accreditation: import('#domain/organisations/accreditation.js').Accreditation, overseasSites: import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext, summaryLogId: string }) => Promise<void>} updateWasteBalanceTransactions
 * @property {(params: DeductAvailableBalanceParams) => Promise<number|null>} deductAvailableBalanceForPrnCreation
 *   Resolves to the appended stream event number on the ledger path, or `null`
 *   on the embedded path (and when no balance exists).
 * @property {(params: DeductTotalBalanceParams) => Promise<number|null>} deductTotalBalanceForPrnIssue
 *   Resolves to the appended stream event number on the ledger path, or `null`
 *   on the embedded path (and when no balance exists).
 * @property {(params: CreditAvailableBalanceParams) => Promise<number|null>} creditAvailableBalanceForPrnCancellation
 *   Resolves to the appended stream event number on the ledger path, or `null`
 *   on the embedded path.
 * @property {(params: CreditFullBalanceParams) => Promise<number|null>} creditFullBalanceForIssuedPrnCancellation
 *   Resolves to the appended stream event number on the ledger path, or `null`
 *   on the embedded path.
 * @property {(params: FlipCanonicalSourceToMigratingParams) => Promise<FlipCanonicalSourceToMigratingResult>} flipCanonicalSourceToMigrating
 *   Promote an `'embedded'` accreditation to `'migrating'` and stamp
 *   `migratingSince`, gated on `version` matching the captured value. The
 *   filter is `{ accreditationId, version: capturedVersion, canonicalSource:
 *   'embedded' }` so the call strictly promotes — `'migrating'` and `'ledger'`
 *   are never demoted. Used as step 1 of a per-accreditation rebuild: while the
 *   marker is `'migrating'`, summary-log submissions for the registration are
 *   409-excluded by `transitionToSubmittingExclusive` so the rebuild has a
 *   stable cross-collection window to replay authoritative history into the
 *   ledger.
 * @property {(params: FlipCanonicalSourceToLedgerParams) => Promise<FlipCanonicalSourceToLedgerResult>} flipCanonicalSourceToLedger
 *   Promote a `'migrating'` accreditation to `'ledger'` and clear
 *   `migratingSince`, gated on `version` matching the captured value. The
 *   filter is `{ accreditationId, version: capturedVersion, canonicalSource:
 *   'migrating' }` so the call strictly promotes — `'embedded'` is never
 *   short-circuited and `'ledger'` never demotes. Used as the final step of a
 *   per-accreditation rebuild after authoritative history has been replayed
 *   into the ledger.
 * @property {(params: ResetCanonicalSourceToEmbeddedParams) => Promise<ResetCanonicalSourceToEmbeddedResult>} resetCanonicalSourceToEmbedded
 *   Unconditionally reset a `'migrating'` accreditation back to `'embedded'`
 *   and clear `migratingSince`. Used by the sweep runner's startup pass to
 *   recover documents stuck in `'migrating'` past the recovery threshold —
 *   the rebuild process died between the two flips and submissions for the
 *   registration are blocked until the marker is reset. Strictly demotes:
 *   `'embedded'` is left as-is and `'ledger'` is never demoted.
 * @property {(params: GetPrnCatchupEventsParams) => Promise<import('./stream-schema.js').StreamEvent[]>} getPrnCatchupEvents
 *   Return the stream tail events to project onto a PRN read. Empty array
 *   when the accreditation's marker is not `'ledger'` (no stream query is
 *   issued), when no balance document exists, or when the ledger-canonical
 *   accreditation has no tail events for this PRN past the watermark.
 */

/**
 * @typedef {() => WasteBalancesRepository} WasteBalancesRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
