import { isNil } from '#common/helpers/is-nil.js'
import {
  greaterThan,
  subtract,
  toNumber
} from '#common/helpers/decimal-utils.js'
import {
  ZERO_TONNAGE,
  addTonnage,
  subtractTonnage,
  toRoundedTonnage
} from '#common/helpers/rounded-tonnage.js'
import { OPERATOR_CATEGORY } from '#reports/domain/operator-category.js'
import { formatPeriodLabel } from '#reports/domain/period-labels.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY } from '#reports/domain/aggregation/fields-by-operator-category.js'
import { filterRecordsByDateField } from '#reports/domain/aggregation/filter-records-by-date.js'
import { wasteRecordStatesForHead } from '#waste-records/application/read-summary-log-row-states.js'

/**
 * @import { OrganisationsRepository } from '#repositories/organisations/port.js'
 * @import { PeriodicReport, ReportsRepository } from '#reports/repository/port.js'
 * @import { WasteRecordState } from '#waste-records/application/read-summary-log-row-states.js'
 * @import { SummaryLogRowStateRepository } from '#waste-records/repository/port.js'
 */

/**
 * Startup diagnostic (PAE-1783): sizes how many accredited-exporter monthly
 * reports carry a wrong `exportActivity.tonnageReceivedNotExported`, and splits
 * them into the ones a later backfill could correct in place and the ones whose
 * source rows can no longer be resolved.
 *
 * The live calculation drops any received load whose DATE_OF_EXPORT falls in the
 * reporting period and sums column S for the rest, so a load carrying an export
 * date but no exported tonnage reads as fully exported and contributes nothing.
 * The AC's rule is per load: column S minus column T. This module recomputes
 * under that rule, deliberately reimplementing it rather than calling the live
 * path, so it is valid both before the fix (as sizing) and after it (as the
 * remediation verifier).
 *
 * Read-only throughout, and safe under live traffic.
 *
 * Rows are read at the summary log the report was actually built from
 * (`source.summaryLogId`), not at the registration's current head, so a finding
 * isolates the calculation bug from data the operator has changed since.
 *
 * Only each period's `current` report is scanned: a superseded submission is
 * never regenerated, so correcting it would change nothing an operator or the
 * regulator reads.
 *
 * @typedef {{
 *   organisationId: string,
 *   registrationId: string,
 *   reportId: string,
 *   month: string,
 *   reportStatus: string
 * }} FindingIdentity
 *
 * @typedef {FindingIdentity & {
 *   kind: 'mismatch',
 *   stored: number,
 *   recomputed: number,
 *   delta: number
 * }} MismatchFinding
 *
 * @typedef {FindingIdentity & { kind: 'source-missing' }} SourceMissingFinding
 *
 * @typedef {FindingIdentity & {
 *   kind: 'recompute-failed',
 *   reason: string
 * }} RecomputeFailedFinding
 *
 * @typedef {MismatchFinding | SourceMissingFinding | RecomputeFailedFinding} NotExportedFinding
 */

/**
 * @typedef {{
 *   organisationId: string,
 *   registrationId: string,
 *   year: number,
 *   period: number,
 *   startDate: string,
 *   endDate: string,
 *   reportId: string,
 *   reportStatus: string,
 *   storedNotExported: number
 * }} ReconcilableReportRow
 */

/** @type {Set<string>} */
const REVIEWABLE_REPORT_STATUSES = new Set([
  REPORT_STATUS.SUBMITTED,
  REPORT_STATUS.IN_PROGRESS,
  REPORT_STATUS.READY_TO_SUBMIT
])

const RECEIVED_DATE_FIELD =
  SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY[OPERATOR_CATEGORY.EXPORTER]
    .wasteReceived

const TONNAGE_RECEIVED_FIELD = 'TONNAGE_RECEIVED_FOR_EXPORT'
const TONNAGE_EXPORTED_FIELD = 'TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED'

/**
 * The monthly reports this diagnostic can reconcile, flattened out of the
 * estate-wide periodic report groupings.
 *
 * A non-null `exportActivity.tonnageReceivedNotExported` identifies an
 * accredited exporter on its own: a registered-only exporter's figure is typed
 * in by hand and stored as null, and a reprocessor has no export activity at
 * all. No registration lookup is needed to filter the population.
 *
 * @param {PeriodicReport[]} periodicReports
 * @returns {ReconcilableReportRow[]}
 */
export const findReconcilableReportRows = (periodicReports) =>
  periodicReports.flatMap(({ organisationId, registrationId, year, reports }) =>
    Object.entries(reports.monthly ?? {}).flatMap(([period, periodInfo]) => {
      const { current } = periodInfo
      if (!current || !REVIEWABLE_REPORT_STATUSES.has(current.status)) {
        return []
      }
      const storedNotExported =
        current.exportActivity?.tonnageReceivedNotExported
      if (isNil(storedNotExported)) {
        return []
      }
      return [
        {
          organisationId,
          registrationId,
          year,
          period: Number(period),
          startDate: periodInfo.startDate,
          endDate: periodInfo.endDate,
          reportId: current.id,
          reportStatus: current.status,
          storedNotExported
        }
      ]
    })
  )

/**
 * A load's contribution to the figure: the tonnage received for export that has
 * not yet been exported. Clamped at zero, since a row reporting more exported
 * than received is a data error rather than a negative amount on site — how that
 * row should be handled at all is still open with the business, so the sizing
 * run takes the conservative reading.
 *
 * @param {Record<string, any>} data
 * @returns {import('#common/helpers/rounded-tonnage.js').RoundedTonnage}
 */
const notExportedForLoad = (data) => {
  const received = toRoundedTonnage(data[TONNAGE_RECEIVED_FIELD])
  const exported = toRoundedTonnage(data[TONNAGE_EXPORTED_FIELD])
  return greaterThan(received, exported)
    ? subtractTonnage(received, exported)
    : ZERO_TONNAGE
}

/**
 * The corrected figure for a period: per load received in that period, column S
 * minus column T, summed. Unlike the live calculation, no load is dropped for
 * carrying an export date.
 *
 * @param {WasteRecordState[]} wasteRecordStates
 * @param {string} startDate
 * @param {string} endDate
 * @returns {number}
 */
const recomputeNotExported = (wasteRecordStates, startDate, endDate) =>
  toNumber(
    filterRecordsByDateField(
      wasteRecordStates,
      RECEIVED_DATE_FIELD,
      startDate,
      endDate
    ).reduce(
      (sum, { data }) => addTonnage(sum, notExportedForLoad(data)),
      ZERO_TONNAGE
    )
  )

/**
 * @param {ReconcilableReportRow} row
 * @returns {FindingIdentity}
 */
const identityOf = (row) => ({
  organisationId: row.organisationId,
  registrationId: row.registrationId,
  reportId: row.reportId,
  month: formatPeriodLabel('monthly', row.period, row.year),
  reportStatus: row.reportStatus
})

/**
 * Compares a report's stored figure against a fresh recomputation under the
 * corrected rule. Returns null when they already agree — the report the fix
 * would leave untouched.
 *
 * `wasteRecordStates` is null when the report's source rows could not be
 * resolved, which is the one case a backfill could not correct on its own.
 *
 * @param {ReconcilableReportRow} row
 * @param {WasteRecordState[] | null} wasteRecordStates
 * @returns {NotExportedFinding | null}
 */
export const diagnoseReportRow = (row, wasteRecordStates) => {
  if (wasteRecordStates === null) {
    return { kind: 'source-missing', ...identityOf(row) }
  }

  let recomputed
  try {
    recomputed = recomputeNotExported(
      wasteRecordStates,
      row.startDate,
      row.endDate
    )
  } catch (error) {
    return {
      kind: 'recompute-failed',
      ...identityOf(row),
      reason: /** @type {Error} */ (error).message
    }
  }

  if (recomputed === row.storedNotExported) {
    return null
  }

  return {
    kind: 'mismatch',
    ...identityOf(row),
    stored: row.storedNotExported,
    recomputed,
    delta: toNumber(subtract(recomputed, row.storedNotExported))
  }
}

/**
 * Renders a finding as one reviewable log line.
 *
 * @param {NotExportedFinding} finding
 * @returns {string}
 */
export const formatNotExportedReconciliationFinding = (finding) => {
  const prefix =
    `Not-exported reconciliation ${finding.kind}: org ${finding.organisationId} / ` +
    `registration ${finding.registrationId}, report ${finding.reportId} ` +
    `(${finding.month}, ${finding.reportStatus}) - `

  if (finding.kind === 'mismatch') {
    return (
      prefix +
      `stored ${finding.stored}, recomputed ${finding.recomputed}, ` +
      `delta ${finding.delta}`
    )
  }
  if (finding.kind === 'recompute-failed') {
    return prefix + finding.reason
  }
  return prefix + 'source rows could not be resolved, cannot recompute'
}

/**
 * The scale figures the run's summary line reports. `totalDelta` covers the
 * mismatches only — the tonnage a backfill would move.
 *
 * @param {NotExportedFinding[]} findings
 * @returns {{
 *   mismatches: number,
 *   sourceMissing: number,
 *   recomputeFailed: number,
 *   affectedOrganisations: number,
 *   totalDelta: number
 * }}
 */
export const summariseNotExportedReconciliation = (findings) => {
  const countOf = (kind) => findings.filter((f) => f.kind === kind).length

  return {
    mismatches: countOf('mismatch'),
    sourceMissing: countOf('source-missing'),
    recomputeFailed: countOf('recompute-failed'),
    affectedOrganisations: new Set(findings.map((f) => f.organisationId)).size,
    totalDelta: toNumber(
      findings.reduce(
        (total, finding) =>
          finding.kind === 'mismatch'
            ? addTonnage(total, toRoundedTonnage(finding.delta))
            : total,
        ZERO_TONNAGE
      )
    )
  }
}

/**
 * The ledgers a registration's uploads may sit under: null (its registered-only
 * phase) and its current accreditation id. Reading both means a report built
 * before accreditation still resolves its rows. A row commits under exactly one
 * ledger, so concatenating the two yields the submission's rows without
 * duplication. Returns null when the registration can no longer be looked up.
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {string} organisationId
 * @param {string} registrationId
 * @returns {Promise<import('#waste-records/repository/port.js').WasteBalanceLedgerId[] | null>}
 */
const resolveLedgers = async (
  organisationsRepository,
  organisationId,
  registrationId
) => {
  let registration
  try {
    registration = await organisationsRepository.findRegistrationById(
      organisationId,
      registrationId
    )
  } catch {
    return null
  }

  const accreditationIds = registration?.accreditationId
    ? [null, registration.accreditationId]
    : [null]

  return accreditationIds.map((accreditationId) => ({
    organisationId,
    registrationId,
    accreditationId
  }))
}

/**
 * The row states the report was built from, or null when they cannot be
 * resolved — no source summary log recorded, no readable registration, or a
 * submission whose rows have gone.
 *
 * @param {{
 *   reportsRepository: ReportsRepository,
 *   organisationsRepository: OrganisationsRepository,
 *   summaryLogRowStateRepository: SummaryLogRowStateRepository
 * }} deps
 * @param {ReconcilableReportRow} row
 * @returns {Promise<WasteRecordState[] | null>}
 */
const loadSourceRowStates = async (
  { reportsRepository, organisationsRepository, summaryLogRowStateRepository },
  row
) => {
  const report = await reportsRepository.findReportById(row.reportId)
  const summaryLogId = report?.source?.summaryLogId ?? null
  if (summaryLogId === null) {
    return null
  }

  const ledgers = await resolveLedgers(
    organisationsRepository,
    row.organisationId,
    row.registrationId
  )
  if (ledgers === null) {
    return null
  }

  const wasteRecordStates = []
  for (const ledger of ledgers) {
    wasteRecordStates.push(
      ...(await wasteRecordStatesForHead(
        summaryLogRowStateRepository,
        ledger,
        summaryLogId
      ))
    )
  }

  return wasteRecordStates.length > 0 ? wasteRecordStates : null
}

/**
 * Scans every reviewable accredited-exporter monthly report across the estate
 * and returns the ones whose stored not-exported figure disagrees with the
 * corrected rule, alongside those that cannot be recomputed at all. Read-only.
 *
 * @param {{
 *   reportsRepository: ReportsRepository,
 *   organisationsRepository: OrganisationsRepository,
 *   summaryLogRowStateRepository: SummaryLogRowStateRepository
 * }} deps
 * @returns {Promise<{ scanned: number, findings: NotExportedFinding[] }>}
 */
export const findNotExportedReconciliationReports = async (deps) => {
  const periodicReports = await deps.reportsRepository.findAllPeriodicReports()
  const rows = findReconcilableReportRows(periodicReports)

  const findings = []
  for (const row of rows) {
    const wasteRecordStates = await loadSourceRowStates(deps, row)
    const finding = diagnoseReportRow(row, wasteRecordStates)
    if (finding) {
      findings.push(finding)
    }
  }

  return { scanned: rows.length, findings }
}
