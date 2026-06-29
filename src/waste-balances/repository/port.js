/**
 * The `expectedHead` on these params is the stream position the caller's
 * balance decision (sufficiency check, reversal) was based on. The append is
 * written at `expectedHead + 1`, so a competing write that has advanced the
 * head since the caller read it makes the append fail rather than proceed from
 * a stale position (ADR-0036). The conflict surfaces to the caller.
 */

/**
 * @typedef {Object} DeductAvailableBalanceParams
 * @property {string} accreditationId
 * @property {string} registrationId
 * @property {string} organisationId
 * @property {string} prnId
 * @property {number} tonnage
 * @property {import('./stream-schema.js').StreamUserSummary} createdBy
 * @property {number} expectedHead
 */

/**
 * @typedef {Object} DeductTotalBalanceParams
 * @property {string} accreditationId
 * @property {string} registrationId
 * @property {string} organisationId
 * @property {string} prnId
 * @property {number} tonnage
 * @property {import('./stream-schema.js').StreamUserSummary} createdBy
 * @property {number} expectedHead
 */

/**
 * @typedef {Object} CreditAvailableBalanceParams
 * @property {string} accreditationId
 * @property {string} registrationId
 * @property {string} organisationId
 * @property {string} prnId
 * @property {number} tonnage
 * @property {import('./stream-schema.js').StreamUserSummary} createdBy
 * @property {number} expectedHead
 */

/**
 * @typedef {Object} CreditFullBalanceParams
 * @property {string} accreditationId
 * @property {string} registrationId
 * @property {string} organisationId
 * @property {string} prnId
 * @property {number} tonnage
 * @property {import('./stream-schema.js').StreamUserSummary} createdBy
 * @property {number} expectedHead
 */

/**
 * @typedef {Object} AppendStreamEventParams
 * @property {string} accreditationId
 * @property {string} registrationId
 * @property {string} organisationId
 * @property {string} prnId
 * @property {number} tonnage
 * @property {import('./stream-schema.js').StreamUserSummary} createdBy
 * @property {import('./stream-schema.js').StreamEventKind} streamKind
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
 * @typedef {Object} WasteBalancesRepository
 * @property {(partition: { registrationId: string, accreditationId: string }) => Promise<import('../domain/model.js').WasteBalance | null>} findBalance
 *   Resolve a balance from its stream partition. `null` when the partition has
 *   no events (the accreditation has no balance).
 * @property {(wasteRecords: import('#domain/waste-records/model.js').WasteRecord[], options: { user: import('#domain/summary-logs/worker/port.js').SubmitUser, accreditation: import('#domain/organisations/accreditation.js').Accreditation, overseasSites: import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext, summaryLogId: string }) => Promise<void>} updateWasteBalanceTransactions
 * @property {(params: DeductAvailableBalanceParams) => Promise<import('./stream-port.js').StreamEvent | null>} deductAvailableBalanceForPrnCreation
 *   Resolves to the appended stream event, or `null` when no balance exists.
 * @property {(params: DeductTotalBalanceParams) => Promise<import('./stream-port.js').StreamEvent | null>} deductTotalBalanceForPrnIssue
 *   Resolves to the appended stream event, or `null` when no balance exists.
 * @property {(params: CreditAvailableBalanceParams) => Promise<import('./stream-port.js').StreamEvent>} creditAvailableBalanceForPrnCancellation
 *   Resolves to the appended stream event. Throws when no balance exists.
 * @property {(params: CreditFullBalanceParams) => Promise<import('./stream-port.js').StreamEvent>} creditFullBalanceForIssuedPrnCancellation
 *   Resolves to the appended stream event. Throws when no balance exists.
 * @property {(params: AppendStreamEventParams) => Promise<import('./stream-port.js').StreamEvent>} appendStreamEvent
 *   Append a status-only PRN event (PRN_ACCEPTED, PRN_REJECTED) to the stream.
 *   Throws when no balance exists.
 * @property {(params: GetPrnCatchupEventsParams) => Promise<import('./stream-schema.js').StreamEvent[]>} getPrnCatchupEvents
 *   Return the stream tail events to project onto a PRN read. Empty array when
 *   the accreditation has no tail events for this PRN past the watermark.
 */

/**
 * @typedef {() => WasteBalancesRepository} WasteBalancesRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
