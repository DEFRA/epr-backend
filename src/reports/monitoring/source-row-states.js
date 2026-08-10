import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import {
  OPERATOR_CATEGORY,
  getOperatorCategory
} from '#reports/domain/operator-category.js'
import { wasteRecordStatesForHead } from '#waste-records/application/read-summary-log-row-states.js'

/**
 * @import { Registration } from '#domain/organisations/registration.js'
 * @import { OrganisationsRepository } from '#repositories/organisations/port.js'
 * @import { ReportsRepository } from '#reports/repository/port.js'
 * @import { WasteBalanceLedgerId } from '#waste-records/repository/port.js'
 * @import { WasteRecordState } from '#waste-records/application/read-summary-log-row-states.js'
 * @import { SummaryLogRowStatesRepository } from '#waste-records/repository/port.js'
 */

/**
 * The rows a report was built from, or the reason they are not there. A reason
 * here means the data genuinely is not present, which a re-run will not change.
 *
 * @typedef {{ states: WasteRecordState[], registration: Registration }
 *   | { unresolved: string }
 *   | { outOfScope: string }} SourceRowStates
 */

/**
 * @typedef {{
 *   reportsRepository: Pick<ReportsRepository, 'findReportById'>,
 *   organisationsRepository: Pick<OrganisationsRepository, 'findRegistrationById'>,
 *   summaryLogRowStatesRepository: Pick<
 *     SummaryLogRowStatesRepository, 'findRowStatesForSummaryLog'
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
 * @param {Registration} registration
 * @param {string} organisationId
 * @param {string} registrationId
 * @returns {WasteBalanceLedgerId[]}
 */
const resolveLedgers = (registration, organisationId, registrationId) => {
  const accreditationIds = registration?.accreditationId
    ? [null, registration.accreditationId]
    : [null]

  return accreditationIds.map((accreditationId) => ({
    organisationId,
    registrationId,
    accreditationId
  }))
}

export const NOT_ACCREDITED_EXPORTER =
  'registration is not an accredited exporter'

/**
 * `wasteProcessingType` is checked first because `getOperatorCategory` throws on
 * an unrecognised one, which the scan would record as a lookup failure.
 *
 * @param {Registration} registration
 * @returns {boolean}
 */
const isAccreditedExporter = (registration) =>
  registration?.wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER &&
  getOperatorCategory(registration) === OPERATOR_CATEGORY.EXPORTER
export const NO_SUMMARY_LOG = 'no source summary log recorded on the report'
export const NO_ROWS = 'no rows found under the registration ledgers'

/**
 * The row states the report was built from, or why there are none. `outOfScope`
 * is not a finding; the two `unresolved` reasons are, and both are stable across
 * re-runs. Anything that throws is not, and is left to propagate.
 *
 * @param {SourceRowStateDeps} deps
 * @param {ReportIdentity} row
 * @returns {Promise<SourceRowStates>}
 */
export const loadSourceRowStates = async (
  { reportsRepository, organisationsRepository, summaryLogRowStatesRepository },
  row
) => {
  const registration = await organisationsRepository.findRegistrationById(
    row.organisationId,
    row.registrationId
  )

  if (!isAccreditedExporter(registration)) {
    return { outOfScope: NOT_ACCREDITED_EXPORTER }
  }

  const report = await reportsRepository.findReportById(row.reportId)
  const summaryLogId = report.source?.summaryLogId ?? null
  if (summaryLogId === null) {
    return { unresolved: NO_SUMMARY_LOG }
  }

  const ledgers = resolveLedgers(
    registration,
    row.organisationId,
    row.registrationId
  )

  const states = []
  for (const ledger of ledgers) {
    states.push(
      ...(await wasteRecordStatesForHead(
        summaryLogRowStatesRepository,
        ledger,
        summaryLogId
      ))
    )
  }

  return states.length > 0 ? { states, registration } : { unresolved: NO_ROWS }
}
