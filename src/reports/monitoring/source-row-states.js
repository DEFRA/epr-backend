import { wasteRecordStatesForHead } from '#waste-records/application/read-summary-log-row-states.js'

/**
 * @import { OrganisationsRepository } from '#repositories/organisations/port.js'
 * @import { ReportsRepository } from '#reports/repository/port.js'
 * @import { WasteRecordState } from '#waste-records/application/read-summary-log-row-states.js'
 * @import { SummaryLogRowStateRepository } from '#waste-records/repository/port.js'
 */

/**
 * The rows a report was built from, or the reason they are not there. A reason
 * here means the data genuinely is not present, which a re-run will not change.
 *
 * @typedef {{ states: WasteRecordState[] } | { unresolved: string }} SourceRowStates
 */

/**
 * @typedef {{
 *   reportsRepository: Pick<ReportsRepository, 'findReportById'>,
 *   organisationsRepository: Pick<OrganisationsRepository, 'findRegistrationById'>,
 *   summaryLogRowStateRepository: Pick<
 *     SummaryLogRowStateRepository, 'findRowStatesForSummaryLog'
 *   >
 * }} SourceRowStateDeps
 */

/**
 * @typedef {{ organisationId: string, registrationId: string, reportId: string }} ReportIdentity
 */

/**
 * The ledger partitions a registration's rows can sit under: the
 * registration itself, and its accreditation once it holds one. Both are
 * probed because a row written before accreditation stays on the first.
 *
 * Only the registration's *current* accreditation is probed, so a report built
 * under an accreditation that has since been superseded resolves no rows and
 * reads as source-missing.
 *
 * Errors propagate: a registration that cannot be read is a fact about the run,
 * not about the exporter's data, and the caller records it as such.
 *
 * @param {SourceRowStateDeps['organisationsRepository']} organisationsRepository
 * @param {string} organisationId
 * @param {string} registrationId
 * @returns {Promise<import('#waste-records/repository/port.js').WasteBalanceLedgerId[]>}
 */
const resolveLedgers = async (
  organisationsRepository,
  organisationId,
  registrationId
) => {
  const registration = await organisationsRepository.findRegistrationById(
    organisationId,
    registrationId
  )

  const accreditationIds = registration?.accreditationId
    ? [null, registration.accreditationId]
    : [null]

  return accreditationIds.map((accreditationId) => ({
    organisationId,
    registrationId,
    accreditationId
  }))
}

export const NO_SUMMARY_LOG = 'no source summary log recorded on the report'
export const NO_ROWS = 'no rows found under the registration ledgers'

/**
 * The row states the report was built from, or the reason there are none. Both
 * reasons are statements about the stored data rather than about this run, so
 * either one is stable across re-runs; anything that throws on the way is not,
 * and is left to propagate.
 *
 * @param {SourceRowStateDeps} deps
 * @param {ReportIdentity} row
 * @returns {Promise<SourceRowStates>}
 */
export const loadSourceRowStates = async (
  { reportsRepository, organisationsRepository, summaryLogRowStateRepository },
  row
) => {
  const report = await reportsRepository.findReportById(row.reportId)
  const summaryLogId = report.source?.summaryLogId ?? null
  if (summaryLogId === null) {
    return { unresolved: NO_SUMMARY_LOG }
  }

  const ledgers = await resolveLedgers(
    organisationsRepository,
    row.organisationId,
    row.registrationId
  )

  const states = []
  for (const ledger of ledgers) {
    states.push(
      ...(await wasteRecordStatesForHead(
        summaryLogRowStateRepository,
        ledger,
        summaryLogId
      ))
    )
  }

  return states.length > 0 ? { states } : { unresolved: NO_ROWS }
}
