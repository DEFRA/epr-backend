/**
 * @import {SummaryLogFileId} from '#domain/summary-logs/ids.js'
 * @import {WasteRecord} from '#domain/waste-records/model.js'
 * @import {RowClassificationContext} from '#waste-balances/domain/waste-balance-classification.js'
 */
import { projectSummaryLogRowState } from './project-summary-log-row-state.js'

/**
 * Persists the committed waste-record state of a summary-log submission — one
 * idempotent upsert per row, keyed by row identity, carrying the coerced data
 * and waste-balance classification. Runs for every submission regardless of
 * processing type or accreditation: the ledger's `accreditationNumber` is null
 * for registered-only and no-accreditation registrations, and rows whose schema
 * has no waste balance classify as NOT_APPLICABLE with no contribution.
 *
 * Records are classified against the same accreditation (or null) as the
 * balance path, so an accredited balance-type submission produces identical row
 * states whichever path it arrives through.
 *
 * @param {Object} params
 * @param {import('#waste-records/repository/port.js').SummaryLogRowStatesRepository} params.summaryLogRowStatesRepository
 * @param {WasteRecord[]} params.wasteRecords
 * @param {RowClassificationContext} params.context
 * @param {import('#waste-balances/repository/ledger-schema.js').WasteBalanceLedgerId} params.ledgerId
 * @param {SummaryLogFileId} params.summaryLogId
 * @returns {Promise<void>}
 */
export const writeSummaryLogRowStates = async ({
  summaryLogRowStatesRepository,
  wasteRecords,
  context,
  ledgerId,
  summaryLogId
}) => {
  const classifiedRows = wasteRecords.map((record) =>
    projectSummaryLogRowState(record, context)
  )

  await summaryLogRowStatesRepository.upsertSummaryLogRowStates(
    ledgerId,
    classifiedRows,
    summaryLogId
  )
}
