import { PermanentError } from '#server/queue-consumer/permanent-error.js'
import { writeSummaryLogRowStates } from '#waste-records/application/write-summary-log-row-states.js'
import { pickLedgerId } from '#waste-balances/repository/ledger-schema.js'
import { submissionCommitOf } from './submission-commit.js'

/**
 * @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js'
 * @import {SummaryLogCommit} from '#domain/summary-logs/commit.js'
 * @import {RowClassificationContext} from '#waste-balances/domain/waste-balance-classification.js'
 * @import {SummaryLogRowStatesRepository} from '#waste-records/repository/port.js'
 * @import {RecordChange} from './record-change.js'
 * @import {SubmittedSummaryLog} from './validate-issue-logging.js'
 */

/**
 * Writes a validated summary log's row states and works out what submitting it
 * commits. The rows stay inert until a summary-log-submitted event names the
 * summary log (ADR-0037), so an upload that is never submitted changes nothing.
 *
 * @param {object} params
 * @param {SubmittedSummaryLog} params.summaryLog
 * @param {ValidatedWasteRecord[]} params.wasteRecords
 * @param {RowClassificationContext} params.classificationContext
 * @param {Map<string, RecordChange>} params.recordChanges
 * @param {SummaryLogRowStatesRepository} params.summaryLogRowStatesRepository
 * @returns {Promise<SummaryLogCommit>}
 */
export const stageSubmission = async ({
  summaryLog,
  wasteRecords,
  classificationContext,
  recordChanges,
  summaryLogRowStatesRepository
}) => {
  const ledgerId = pickLedgerId(summaryLog)
  const summaryLogId = summaryLog.file.id

  // Worked out before the row write: once rows are written a retry fails
  // permanently, so a throw here must not leave them behind.
  const commit = submissionCommitOf({
    wasteRecords,
    classificationContext,
    recordChanges
  })

  // The context may have changed since an earlier attempt wrote its rows, and
  // the rows would then no longer reproduce the credit (ADR-0058).
  const heldRows =
    await summaryLogRowStatesRepository.findWasteRecordStatesForSummaryLog(
      ledgerId,
      summaryLogId
    )
  if (heldRows.length > 0) {
    throw new PermanentError(
      `Summary log ${summaryLogId} already holds rows from an earlier validation: it must be uploaded again`
    )
  }

  await writeSummaryLogRowStates({
    summaryLogRowStatesRepository,
    wasteRecords: wasteRecords.map(({ record }) => record),
    classificationContext,
    ledgerId,
    summaryLogId
  })

  return { ...commit, rowStatesWritten: true }
}
