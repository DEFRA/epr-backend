/**
 * Storage-level port for committed row states (ADR-0037 Stage 1).
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
 * ever grows; `upsertRowStates` is an idempotent no-op on a repeated
 * submission.
 */

/**
 * @typedef {import('./schema.js').RowState} RowState
 */

/**
 * @typedef {import('./schema.js').RowStateInsert} RowStateInsert
 */

/**
 * @typedef {import('./schema.js').RowStateEntry} RowStateEntry
 */

/**
 * @typedef {import('./schema.js').RowStatePartition} RowStatePartition
 */

/**
 * @typedef {Object} RowStateRepository
 * @property {(partition: RowStatePartition, rowStates: RowStateEntry[], summaryLogId: string) => Promise<RowState[]>} upsertRowStates
 *   For each row, find the existing state document for that row identity whose
 *   coerced `data` and `classification` equal the incoming entry. If one
 *   exists, `$addToSet` `summaryLogId` onto its membership; otherwise insert a
 *   new state document whose membership starts with `summaryLogId`. Idempotent:
 *   re-running the same submission adds no document and no membership entry.
 *   Returns the resulting state document for each entry, in input order.
 * @property {(summaryLogId: string) => Promise<RowState[]>} findBySummaryLogId
 *   Return every state document whose membership contains `summaryLogId` — the
 *   full committed row state of the submission that produced it.
 * @property {(organisationId: string, registrationId: string, rowId: string, wasteRecordType: string) => Promise<RowState[]>} findRowHistory
 *   Return every state document for the given row identity.
 */

/**
 * @typedef {() => RowStateRepository} RowStateRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
