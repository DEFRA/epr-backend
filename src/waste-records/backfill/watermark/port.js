/**
 * Storage-level port for the summary-log-row-states backfill watermark.
 *
 * The estate backfill is a fire-and-forget background task on the running
 * service: a pod cycled mid-walk must resume against the true remaining gap
 * rather than re-grinding from the start. This store records, per registration,
 * the last submission whose row states have durably landed — the strictly-after
 * completion token B1 relies on. It is a single document per registration
 * written *after* that submission's row upserts return, so its presence proves
 * the submission was written in full and a resumed run skips at or before it.
 *
 * A watermark is `null` until the first submission for a registration commits.
 * `advance` only ever moves the watermark forward in replay order — the backfill
 * processes submissions in ascending `(submittedAt, summaryLogId)` order under a
 * cross-instance lock, so the store is a single-writer, monotonic record.
 */

/**
 * @typedef {Object} BackfillWatermark
 * @property {string} submittedAt - ISO8601 timestamp of the last committed submission
 * @property {string} summaryLogId - `file.id` tiebreak of the last committed submission
 */

/**
 * @typedef {Object} SummaryLogRowStatesBackfillWatermarkRepository
 * @property {(organisationId: string, registrationId: string) => Promise<BackfillWatermark | null>} read
 *   The last committed submission for a registration, or `null` when none has
 *   committed yet.
 * @property {(organisationId: string, registrationId: string, watermark: BackfillWatermark) => Promise<void>} advance
 *   Record `watermark` as the last committed submission for a registration.
 *   Idempotent: re-advancing to the same position is a no-op set.
 */

/**
 * @typedef {() => SummaryLogRowStatesBackfillWatermarkRepository} SummaryLogRowStatesBackfillWatermarkRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
