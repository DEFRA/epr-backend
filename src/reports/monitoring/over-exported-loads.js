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
 * @import { RoundedTonnage } from '#common/helpers/rounded-tonnage.js'
 * @import { PeriodicReport, ReportsRepository } from '#reports/repository/port.js'
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
 *   material: string,
 *   loads: OverExportedLoad[],
 *   totalOvershoot: number,
 *   net: number
 * }} OverExportedLoadsFinding
 */

export const UNKNOWN_MATERIAL = 'unknown'

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
 * @returns {RoundedTonnage | null}
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
 * @returns {WasteRecordState[]}
 */
const loadsIn = (states, startDate, endDate) =>
  filterRecordsByDateField(states, RECEIVED_DATE_FIELD, startDate, endDate)

/**
 * @param {WasteRecordState[]} loads
 * @returns {OverExportedLoad[]}
 */
const overExportedAmong = (loads) =>
  loads.flatMap(({ rowId, data }) => {
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
 * The summary log's own net across every load received in the period: the sum
 * of column S less the sum of column T. A blank received tonnage still
 * contributes its `-T`, so a log can net negative with no over-exported load of
 * its own.
 *
 * @param {WasteRecordState[]} loads
 * @returns {number}
 */
const netOf = (loads) =>
  toNumber(
    subtractTonnage(
      loads.reduce(
        (sum, { data }) =>
          addTonnage(sum, toRoundedTonnage(data[TONNAGE_RECEIVED_FIELD])),
        ZERO_TONNAGE
      ),
      loads.reduce(
        (sum, { data }) =>
          addTonnage(sum, toRoundedTonnage(data[TONNAGE_EXPORTED_FIELD])),
        ZERO_TONNAGE
      )
    )
  )

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

    const inPeriod = loadsIn(sourceRowStates.states, row.startDate, row.endDate)
    const loads = overExportedAmong(inPeriod)

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
              material:
                sourceRowStates.registration?.material ?? UNKNOWN_MATERIAL,
              loads,
              totalOvershoot: toNumber(
                loads.reduce(
                  (sum, { overshoot }) =>
                    addTonnage(sum, toRoundedTonnage(overshoot)),
                  ZERO_TONNAGE
                )
              ),
              net: netOf(inPeriod)
            }
    }
  } catch {
    return { inScope: true }
  }
}

/**
 * Scans every reviewable accredited-exporter monthly report across the estate
 * and returns the loads reporting more tonnage exported than received, with the
 * size of each overshoot. Read-only, safe under live traffic.
 *
 * A report whose rows cannot be read is skipped rather than failing the run:
 * the diagnostic gets one pass per deploy, and a single unreadable report must
 * not cost it everything already found.
 *
 * @param {SourceRowStateDeps & {
 *   reportsRepository: Pick<
 *     ReportsRepository,
 *     'findAllPeriodicReports' | 'findReportById'
 *   >
 * }} deps
 * @returns {Promise<{ scanned: number, findings: OverExportedLoadsFinding[] }>}
 */
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
  masked: findings.filter(({ net }) => net >= 0).length,
  totalOvershoot: toNumber(
    findings.reduce(
      (sum, { totalOvershoot }) =>
        addTonnage(sum, toRoundedTonnage(totalOvershoot)),
      ZERO_TONNAGE
    )
  )
})

/**
 * Overshoot rolled up by the registration's material, summed from the loads
 * themselves. Splitting a summary log's netted figure would fold away the very
 * rows this run exists to count.
 *
 * @param {OverExportedLoadsFinding[]} findings
 */
export const summariseOverExportedLoadsByMaterial = (findings) =>
  Object.entries(
    findings.reduce((byMaterial, { material, loads }) => {
      byMaterial[material] = loads.reduce(
        (sum, { overshoot }) => addTonnage(sum, toRoundedTonnage(overshoot)),
        byMaterial[material] ?? ZERO_TONNAGE
      )
      return byMaterial
    }, /** @type {Record<string, ReturnType<typeof toRoundedTonnage>>} */ ({}))
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([material, overshoot]) => ({
      material,
      overshoot: toNumber(overshoot)
    }))

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
