import { projectSummaryLogRowState } from './project-summary-log-row-state.js'

/**
 * @import { OverseasSitesContext } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
 */

/**
 * Persists the committed waste-record state of a summary-log submission — one
 * idempotent upsert per row, keyed by row identity, carrying the coerced data
 * and waste-balance classification. Runs for every submission regardless of
 * processing type or accreditation: the ledger's `accreditationId` is null
 * for registered-only and no-accreditation registrations, and rows whose schema
 * has no waste balance classify as NOT_APPLICABLE with no contribution.
 *
 * Records are classified against the same accreditation (or null) as the
 * balance path, so an accredited balance-type submission produces identical row
 * states whichever path it arrives through.
 *
 * @param {Object} params
 * @param {import('#waste-records/repository/port.js').SummaryLogRowStateRepository} params.summaryLogRowStateRepository
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} params.wasteRecords
 * @param {{ id: string, validFrom?: string, validTo?: string } | null} params.accreditation
 * @param {import('#waste-records/repository/schema.js').WasteBalanceLedgerId} params.ledgerId
 * @param {OverseasSitesContext} params.overseasSites
 * @param {string} params.summaryLogId
 * @returns {Promise<void>}
 */
export const writeSummaryLogRowStates = async ({
  summaryLogRowStateRepository,
  wasteRecords,
  accreditation,
  ledgerId,
  overseasSites,
  summaryLogId
}) => {
  const classifiedRows = wasteRecords.map((record) =>
    projectSummaryLogRowState(record, accreditation, overseasSites)
  )

  await summaryLogRowStateRepository.upsertSummaryLogRowStates(
    ledgerId,
    classifiedRows,
    summaryLogId
  )
}
