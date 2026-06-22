import { reconstructSubmissionRowStates } from './reconstruct-submission-rowstates.js'

/**
 * @import { RowStatePartition } from '#waste-records/repository/schema.js'
 * @import { RowStateRepository } from '#waste-records/repository/port.js'
 * @import { WasteRecord } from '#domain/waste-records/model.js'
 * @import { OrderedSummaryLog } from './reconstruct-submission-rowstates.js'
 */

/**
 * What a single registration's backfill committed, for migration logging.
 *
 * @typedef {Object} RegistrationBackfillSummary
 * @property {number} submissionCount - Submitted summary logs replayed
 * @property {number} rowStateWriteCount - Row-state entries upserted across them
 */

/**
 * Backfill one registration's committed row-states from its sparse version
 * history. Reconstructs each historical submission's membership in stream order
 * and upserts it through the guarded `upsertRowStates`, so a row unchanged
 * across submissions dedups to one document whose membership grows. Re-runnable:
 * the upsert is idempotent, so a second pass commits nothing new.
 *
 * Submissions are upserted sequentially, not concurrently: membership growth
 * depends on an earlier submission's document already existing when a later one
 * that shares its state is written.
 *
 * @param {Object} params
 * @param {RowStatePartition} params.partition
 * @param {WasteRecord[]} params.wasteRecords
 * @param {OrderedSummaryLog[]} params.summaryLogs
 * @param {Object} params.accreditation
 * @param {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} params.overseasSites
 * @param {RowStateRepository} params.rowStateRepository
 * @returns {Promise<RegistrationBackfillSummary>}
 */
export const backfillRegistrationRowStates = async ({
  partition,
  wasteRecords,
  summaryLogs,
  accreditation,
  overseasSites,
  rowStateRepository
}) => {
  const submissions = reconstructSubmissionRowStates({
    wasteRecords,
    summaryLogs,
    accreditation,
    overseasSites
  })

  let rowStateWriteCount = 0
  for (const { summaryLogId, entries } of submissions) {
    await rowStateRepository.upsertRowStates(partition, entries, summaryLogId)
    rowStateWriteCount += entries.length
  }

  return { submissionCount: submissions.length, rowStateWriteCount }
}
