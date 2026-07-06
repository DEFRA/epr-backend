import { reconstructSubmissionSummaryLogRowStates } from './reconstruct-submission-summary-log-row-states.js'

/**
 * @import { WasteBalanceLedgerId } from '#waste-records/repository/schema.js'
 * @import { SummaryLogRowStateRepository } from '#waste-records/repository/port.js'
 * @import { WasteRecord } from '#domain/waste-records/model.js'
 * @import { OrderedSummaryLog } from './reconstruct-submission-summary-log-row-states.js'
 */

/**
 * What a single registration's backfill wrote, for migration logging.
 *
 * @typedef {Object} RegistrationBackfillSummary
 * @property {number} submissionCount - Submitted summary logs replayed
 * @property {number} summaryLogRowStateWriteCount - Row-state entries upserted across them
 */

/**
 * Backfill one registration's summary-log row states from its sparse version
 * history. Reconstructs each historical submission's membership in stream order
 * and upserts it through the guarded `upsertSummaryLogRowStates`, so a row unchanged
 * across submissions dedups to one document whose membership grows. Re-runnable:
 * the upsert is idempotent, so a second pass writes nothing new.
 *
 * Submissions are upserted sequentially, not concurrently: membership growth
 * depends on an earlier submission's document already existing when a later one
 * that shares its state is written.
 *
 * @param {Object} params
 * @param {WasteBalanceLedgerId} params.ledgerId
 * @param {WasteRecord[]} params.wasteRecords
 * @param {OrderedSummaryLog[]} params.summaryLogs
 * @param {Object} params.accreditation
 * @param {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} params.overseasSites
 * @param {SummaryLogRowStateRepository} params.summaryLogRowStateRepository
 * @returns {Promise<RegistrationBackfillSummary>}
 */
export const backfillRegistrationSummaryLogRowStates = async ({
  ledgerId,
  wasteRecords,
  summaryLogs,
  accreditation,
  overseasSites,
  summaryLogRowStateRepository
}) => {
  const submissions = reconstructSubmissionSummaryLogRowStates({
    wasteRecords,
    summaryLogs,
    accreditation,
    overseasSites
  })

  let summaryLogRowStateWriteCount = 0
  for (const { summaryLogId, entries } of submissions) {
    await summaryLogRowStateRepository.upsertSummaryLogRowStates(
      ledgerId,
      entries,
      summaryLogId
    )
    summaryLogRowStateWriteCount += entries.length
  }

  return { submissionCount: submissions.length, summaryLogRowStateWriteCount }
}
