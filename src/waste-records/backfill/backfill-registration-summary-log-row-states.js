import { reconstructSubmissionSummaryLogRowStates } from './reconstruct-submission-summary-log-row-states.js'
import { isCoveredByWatermark } from './submission-order.js'

/**
 * @import { WasteBalanceLedgerId } from '#waste-records/repository/schema.js'
 * @import { SummaryLogRowStateRepository } from '#waste-records/repository/port.js'
 * @import { WasteRecord } from '#domain/waste-records/model.js'
 * @import { OrderedSummaryLog } from './reconstruct-submission-summary-log-row-states.js'
 * @import { BackfillWatermark } from './watermark/port.js'
 * @import { SummaryLogRowStatesBackfillWatermarkRepository } from './watermark/port.js'
 */

/**
 * What a single registration's backfill committed this run, for migration
 * logging. `submissionsCommitted` counts only the submissions newly written by
 * this run — a resumed pod skips those already at or before the watermark, so a
 * fully-backfilled registration reports zero.
 *
 * @typedef {Object} RegistrationBackfillSummary
 * @property {number} submissionsCommitted - Submissions newly written this run
 * @property {number} summaryLogRowStateWriteCount - Row-state entries upserted across them
 */

/**
 * Backfill one registration's summary-log row states from its sparse version
 * history, resuming from the persisted watermark. Reconstructs each historical
 * submission's membership in stream order and, for every submission after the
 * watermark, upserts it through the guarded `upsertSummaryLogRowStates` (so a
 * row unchanged across submissions dedups to one document whose membership
 * grows) and then advances the watermark to it. The watermark is advanced
 * strictly after a submission's row upserts return, so a pod that dies mid-write
 * re-commits at most that one submission on the next run and the idempotent
 * upsert heals the partial. Re-runnable: a second pass over an unchanged
 * registration commits nothing.
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
 * @param {SummaryLogRowStatesBackfillWatermarkRepository} params.summaryLogRowStatesBackfillWatermarkRepository
 * @param {BackfillWatermark | null} [params.watermark] - Last submission a prior run committed, or null
 * @returns {Promise<RegistrationBackfillSummary>}
 */
export const backfillRegistrationSummaryLogRowStates = async ({
  ledgerId,
  wasteRecords,
  summaryLogs,
  accreditation,
  overseasSites,
  summaryLogRowStateRepository,
  summaryLogRowStatesBackfillWatermarkRepository,
  watermark = null
}) => {
  const submissions = reconstructSubmissionSummaryLogRowStates({
    wasteRecords,
    summaryLogs,
    accreditation,
    overseasSites
  })

  let summaryLogRowStateWriteCount = 0
  let submissionsCommitted = 0
  for (const { summaryLogId, entries, submittedAt } of submissions) {
    if (isCoveredByWatermark({ submittedAt, summaryLogId }, watermark)) {
      continue
    }
    await summaryLogRowStateRepository.upsertSummaryLogRowStates(
      ledgerId,
      entries,
      summaryLogId
    )
    await summaryLogRowStatesBackfillWatermarkRepository.advance(
      ledgerId.organisationId,
      ledgerId.registrationId,
      { submittedAt, summaryLogId }
    )
    summaryLogRowStateWriteCount += entries.length
    submissionsCommitted += 1
  }

  return { submissionsCommitted, summaryLogRowStateWriteCount }
}
