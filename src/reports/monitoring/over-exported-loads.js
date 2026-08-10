import { isNil } from '#common/helpers/is-nil.js'
import { greaterThan, toNumber } from '#common/helpers/decimal-utils.js'
import {
  ZERO_TONNAGE,
  addTonnage,
  subtractTonnage,
  toRoundedTonnage
} from '#common/helpers/rounded-tonnage.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { OPERATOR_CATEGORY } from '#reports/domain/operator-category.js'
import { formatPeriodLabel } from '#reports/domain/period-labels.js'
import { SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY } from '#reports/domain/aggregation/fields-by-operator-category.js'
import { filterRecordsByDateField } from '#reports/domain/aggregation/filter-records-by-date.js'
import { findReviewableReportRows } from './unexported-tonnage.js'
import { loadSourceRowStates } from './source-row-states.js'

/**
 * @import { PeriodicReport } from '#reports/repository/port.js'
 * @import { SourceRowStateDeps } from './source-row-states.js'
 * @import { ReviewableReportRow } from './unexported-tonnage.js'
 * @import { WasteRecordState } from '#waste-records/application/read-summary-log-row-states.js'
 */

/**
 * A load claiming more tonnage exported than it received. Physically
 * impossible, so it marks a data error rather than a quantity.
 *
 * @typedef {{
 *   rowId: string,
 *   received: number,
 *   exported: number,
 *   overshoot: number
 * }} OverExportedLoad
 *
 * @typedef {{
 *   organisationId: string,
 *   registrationId: string,
 *   reportId: string,
 *   year: number,
 *   period: number,
 *   reportStatus: string,
 *   loads: OverExportedLoad[],
 *   totalOvershoot: number
 * }} OverExportedLoadsFinding
 */

const RECEIVED_DATE_FIELD =
  SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY[OPERATOR_CATEGORY.EXPORTER]
    .wasteReceived

const TONNAGE_RECEIVED_FIELD = 'TONNAGE_RECEIVED_FOR_EXPORT'
const TONNAGE_EXPORTED_FIELD = 'TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED'

/**
 * By how much a load over-exported, or null when it did not.
 *
 * A load with no received tonnage recorded is excluded: every field on the
 * received-loads table is optional, so a blank reads as zero and would
 * otherwise present as an over-export. That is a different defect with a
 * different remedy, and folding the two together would misreport both.
 *
 * @param {Record<string, any>} data
 * @returns {import('#common/helpers/rounded-tonnage.js').RoundedTonnage | null}
 */
const overshootOf = (data) => {
  if (isNil(data[TONNAGE_RECEIVED_FIELD])) {
    return null
  }

  const received = toRoundedTonnage(data[TONNAGE_RECEIVED_FIELD])
  const exported = toRoundedTonnage(data[TONNAGE_EXPORTED_FIELD])

  return greaterThan(exported, received)
    ? subtractTonnage(exported, received)
    : null
}

/**
 * @param {WasteRecordState[]} states
 * @param {string} startDate
 * @param {string} endDate
 * @returns {OverExportedLoad[]}
 */
const overExportedLoadsIn = (states, startDate, endDate) =>
  filterRecordsByDateField(
    states,
    RECEIVED_DATE_FIELD,
    startDate,
    endDate
  ).flatMap(({ rowId, data }) => {
    const overshoot = overshootOf(data)
    return overshoot === null
      ? []
      : [
          {
            rowId,
            received: toNumber(toRoundedTonnage(data[TONNAGE_RECEIVED_FIELD])),
            exported: toNumber(toRoundedTonnage(data[TONNAGE_EXPORTED_FIELD])),
            overshoot: toNumber(overshoot)
          }
        ]
  })

/**
 * Scans every reviewable accredited-exporter monthly report across the estate
 * and returns the loads reporting more tonnage exported than received, with the
 * size of each overshoot. Read-only, safe under live traffic.
 *
 * A report whose rows cannot be read is skipped rather than failing the run:
 * the diagnostic gets one pass per deploy, and a single unreadable report must
 * not cost it everything already found. Unlike the unexported-tonnage sizing,
 * an unreadable report is not itself a finding here — this run is about loads
 * that exist, not reports that cannot be assessed.
 *
 * @param {SourceRowStateDeps & {
 *   reportsRepository: Pick<
 *     import('#reports/repository/port.js').ReportsRepository,
 *     'findAllPeriodicReports' | 'findReportById'
 *   >
 * }} deps
 * @returns {Promise<{ scanned: number, findings: OverExportedLoadsFinding[] }>}
 */
/**
 * @param {SourceRowStateDeps} deps
 * @param {ReviewableReportRow} row
 * @returns {Promise<{
 *   inScope: boolean,
 *   finding?: OverExportedLoadsFinding | null
 * }>}
 */
const assessReportRow = async (deps, row) => {
  try {
    const sourceRowStates = await loadSourceRowStates(deps, row)
    if ('outOfScope' in sourceRowStates) {
      return { inScope: false }
    }
    if ('unresolved' in sourceRowStates) {
      return { inScope: true }
    }

    const loads = overExportedLoadsIn(
      sourceRowStates.states,
      row.startDate,
      row.endDate
    )

    return {
      inScope: true,
      finding:
        loads.length === 0
          ? null
          : {
              organisationId: row.organisationId,
              registrationId: row.registrationId,
              reportId: row.reportId,
              year: row.year,
              period: row.period,
              reportStatus: row.reportStatus,
              loads,
              totalOvershoot: toNumber(
                loads.reduce(
                  (sum, { overshoot }) =>
                    addTonnage(sum, toRoundedTonnage(overshoot)),
                  ZERO_TONNAGE
                )
              )
            }
    }
  } catch {
    return { inScope: true }
  }
}

export const findOverExportedLoads = async (deps) => {
  /** @type {PeriodicReport[]} */
  const periodicReports = await deps.reportsRepository.findAllPeriodicReports()
  const rows = findReviewableReportRows(periodicReports)

  const outcomes = []
  for (const row of rows) {
    outcomes.push(await assessReportRow(deps, row))
  }

  const inScope = outcomes.filter(({ inScope }) => inScope)

  return {
    scanned: inScope.length,
    findings: inScope.flatMap(({ finding }) => (finding ? [finding] : []))
  }
}

/**
 * @param {OverExportedLoadsFinding} finding
 * @returns {string}
 */
export const formatOverExportedLoadsFinding = (finding) =>
  `Over-exported loads: org ${finding.organisationId} / ` +
  `registration ${finding.registrationId}, report ${finding.reportId} ` +
  `(${formatPeriodLabel(CADENCE.monthly, finding.period, finding.year)}, ` +
  `${finding.reportStatus}) - ${finding.loads.length} load(s), ` +
  `overshoot ${finding.totalOvershoot} (` +
  finding.loads
    .map(
      ({ rowId, received, exported }) =>
        `${rowId} received ${received} exported ${exported}`
    )
    .join('; ') +
  ')'

/**
 * @param {OverExportedLoadsFinding[]} findings
 */
export const summariseOverExportedLoadsFindings = (findings) => ({
  reports: findings.length,
  loads: findings.reduce((total, { loads }) => total + loads.length, 0),
  exporters: new Set(findings.map(({ registrationId }) => registrationId)).size,
  organisations: new Set(findings.map(({ organisationId }) => organisationId))
    .size,
  totalOvershoot: toNumber(
    findings.reduce(
      (sum, { totalOvershoot }) =>
        addTonnage(sum, toRoundedTonnage(totalOvershoot)),
      ZERO_TONNAGE
    )
  )
})

/**
 * @param {OverExportedLoadsFinding[]} findings
 */
export const summariseOverExportedLoadsByMonth = (findings) =>
  Object.entries(
    findings.reduce((byPeriod, finding) => {
      const key = `${finding.year}-${String(finding.period).padStart(2, '0')}`
      const existing = byPeriod[key] ?? {
        year: finding.year,
        period: finding.period,
        reports: 0,
        loads: 0,
        overshoot: ZERO_TONNAGE
      }
      byPeriod[key] = {
        ...existing,
        reports: existing.reports + 1,
        loads: existing.loads + finding.loads.length,
        overshoot: addTonnage(
          existing.overshoot,
          toRoundedTonnage(finding.totalOvershoot)
        )
      }
      return byPeriod
    }, /** @type {Record<string, *>} */ ({}))
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, { year, period, reports, loads, overshoot }]) => ({
      month: formatPeriodLabel(CADENCE.monthly, period, year),
      reports,
      loads,
      overshoot: toNumber(overshoot)
    }))

/**
 * The biggest overshoots across the estate, so one outlier is not read as
 * estate-wide drift.
 *
 * @param {OverExportedLoadsFinding[]} findings
 * @param {number} limit
 */
export const largestOverExportedLoads = (findings, limit) =>
  findings
    .flatMap(({ reportId, loads }) =>
      loads.map(({ rowId, overshoot }) => ({ reportId, rowId, overshoot }))
    )
    .sort((a, b) => b.overshoot - a.overshoot)
    .slice(0, limit)
