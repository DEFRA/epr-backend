/**
 * Storage-level port for summary-log row states (ADR-0037 Stage 1).
 *
 * One document per *distinct committed state* of a row, carrying a
 * `summaryLogIds` membership array of every submission that committed that
 * exact `(data, classification)`. The dedup comparison and membership growth
 * are the only behaviour where two correct adapters could differ; everything
 * downstream (committed-state reads, row history) is a query over the same
 * documents.
 *
 * Invariants the adapters must hold (ADR-0037 calls these "disciplinary"):
 * `data` and `classification` never change once written; `summaryLogIds` only
 * ever grows; `upsertSummaryLogRowStates` is an idempotent no-op on a repeated
 * submission.
 */

/**
 * @typedef {import('./schema.js').SummaryLogRowState} SummaryLogRowState
 */

/**
 * @typedef {import('./schema.js').SummaryLogRowStateInsert} SummaryLogRowStateInsert
 */

/**
 * @typedef {import('./schema.js').SummaryLogRowStateEntry} SummaryLogRowStateEntry
 */

/**
 * @typedef {import('./schema.js').WasteBalanceLedgerId} WasteBalanceLedgerId
 */

/**
 * A row as it was submitted: the ledger identity that owns it, the submissions
 * that committed it, the template it reported under, and its coerced data. It
 * carries no waste-balance classification, because a reader that answers a
 * question about the present derives one against today's accreditation and
 * overseas-site data rather than the reading stamped at submission.
 *
 * @typedef {WasteBalanceLedgerId & Pick<SummaryLogRowState, 'summaryLogIds' | 'wasteRecordType' | 'processingType' | 'data'>} SubmittedRowState
 */

/**
 * @typedef {Object} SummaryLogRowStatesRepository
 * @property {(ledgerId: WasteBalanceLedgerId, summaryLogRowStates: SummaryLogRowStateEntry[], summaryLogId: string) => Promise<SummaryLogRowState[]>} upsertSummaryLogRowStates
 *   For each row, find the existing state document for that row identity whose
 *   coerced `data` and `classification` equal the incoming entry. If one
 *   exists, `$addToSet` `summaryLogId` onto its membership; otherwise insert a
 *   new state document whose membership starts with `summaryLogId`. Idempotent:
 *   re-running the same submission adds no document and no membership entry.
 *   Returns the resulting state document for each entry, in input order.
 * @property {(ledgerId: WasteBalanceLedgerId, summaryLogId: string) => Promise<SummaryLogRowState[]>} findRowStatesForSummaryLog
 *   Return the row states `ledgerId` holds at the summary log `summaryLogId`.
 *   A row state belongs to the ledger that wrote it, so the summary log alone
 *   does not identify one: the same `summaryLogId` under a different ledger
 *   identity matches nothing.
 * @property {(organisationId: string, registrationId: string, rowId: string, wasteRecordType: string) => Promise<SummaryLogRowState[]>} findRowHistory
 *   Return every state document for the given row identity.
 * @property {(summaryLogIds: string[]) => AsyncIterable<SubmittedRowState>} streamRowStatesForSummaryLogs
 *   Yield every state document whose membership contains any of `summaryLogIds`,
 *   once each however many of them it belongs to, carrying its whole membership
 *   so the caller can tell which submission it belongs to. Neither a ledger nor
 *   a submission identifies a row on its own here: one summary log id can belong
 *   to more than one ledger, and one ledger's rows can belong to submissions
 *   other than the one asked for, so this yields the union and the caller
 *   narrows. Yields rather than returns so a reader aggregating the whole
 *   service holds one batch at a time rather than every row of every
 *   submission.
 * @property {() => Promise<string[]>} findDistinctDataKeys
 *   Return the union of every key observed on `data` across every state
 *   document in the collection. Used by the CSV export to compose its dynamic
 *   header without materialising any document into memory.
 */

/**
 * @typedef {() => SummaryLogRowStatesRepository} SummaryLogRowStatesRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
