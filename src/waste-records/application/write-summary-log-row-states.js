import { markExcludedRecords } from '#waste-balances/application/mark-excluded-records.js'
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
 * has no waste balance classify as EXCLUDED with no contribution. The write is
 * gated by the summary-log-row-states feature flag; with it off this is a no-op,
 * so the row-state repository is never reached.
 *
 * Records are first marked excluded-or-included exactly as the balance path
 * does, then classified against the same accreditation (or null), so an
 * accredited balance-type submission produces identical row states whether it
 * arrives here or, previously, through the balance path.
 *
 * @param {Object} params
 * @param {import('#waste-records/repository/port.js').SummaryLogRowStateRepository} params.summaryLogRowStateRepository
 * @param {import('#feature-flags/feature-flags.port.js').FeatureFlags} [params.featureFlags]
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} params.wasteRecords
 * @param {{ id: string, validFrom?: string, validTo?: string } | null} params.accreditation
 * @param {import('#waste-records/repository/schema.js').WasteBalanceLedgerId} params.ledgerId
 * @param {OverseasSitesContext} params.overseasSites
 * @param {string} params.summaryLogId
 * @returns {Promise<void>}
 */
export const writeSummaryLogRowStates = async ({
  summaryLogRowStateRepository,
  featureFlags,
  wasteRecords,
  accreditation,
  ledgerId,
  overseasSites,
  summaryLogId
}) => {
  if (!featureFlags?.isSummaryLogRowStatesEnabled()) {
    return
  }

  const classifiedRows = markExcludedRecords(wasteRecords).map((record) =>
    projectSummaryLogRowState(record, accreditation, overseasSites)
  )

  await summaryLogRowStateRepository.upsertSummaryLogRowStates(
    ledgerId,
    classifiedRows,
    summaryLogId
  )
}
