import { isNil } from '#common/helpers/is-nil.js'
import { greaterThan, toNumber } from '#common/helpers/decimal-utils.js'
import { resolveDetailedMaterial } from '#domain/organisations/registration-utils.js'
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
 *
 * A report in scope whose loads could not be read: the source log is not
 * recorded, nothing resolves under the registration's ledgers, or the read
 * itself failed. All three subtract from the run's coverage in the same way, so
 * they share one bucket and the reason names which. Kept apart from the
 * findings: it says nothing about the exporter's data, and without it a
 * systematic failure reads the same as a clean estate.
 *
 * @typedef {{ reportId: string, reason: string }} UnreadableReport
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
 *   finding?: OverExportedLoadsFinding | null,
 *   unreadable?: UnreadableReport
 * }>}
 */
const assessReportRow = async (deps, row) => {
  try {
    const sourceRowStates = await loadSourceRowStates(deps, row)
    if ('outOfScope' in sourceRowStates) {
      return { inScope: false }
    }
    if ('unclassified' in sourceRowStates) {
      return {
        inScope: false,
        unreadable: {
          reportId: row.reportId,
          reason: sourceRowStates.unclassified
        }
      }
    }
    if ('unresolved' in sourceRowStates) {
      return {
        inScope: true,
        unreadable: {
          reportId: row.reportId,
          reason: sourceRowStates.unresolved
        }
      }
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
                resolveDetailedMaterial(sourceRowStates.registration) ??
                UNKNOWN_MATERIAL,
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
  } catch (error) {
    return {
      inScope: true,
      unreadable: {
        reportId: row.reportId,
        reason: /** @type {Error} */ (error).message
      }
    }
  }
}

/**
 * Scans every reviewable exporter monthly report across the estate and returns
 * the loads reporting more tonnage exported than received, with the size of
 * each overshoot. Read-only, safe under live traffic.
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
 * @returns {Promise<{
 *   scanned: number,
 *   unreadable: UnreadableReport[],
 *   findings: OverExportedLoadsFinding[]
 * }>}
 */
export const findOverExportedLoads = async (deps) => {
  /** @type {PeriodicReport[]} */
  const periodicReports = await deps.reportsRepository.findAllPeriodicReports()
  const rows = findReviewableReportRows(periodicReports)

  const outcomes = []
  for (const row of rows) {
    outcomes.push(await assessReportRow(deps, row))
  }

  const covered = outcomes.filter((outcome) => outcome.inScope)

  return {
    scanned: covered.length,
    unreadable: outcomes.flatMap(({ unreadable }) =>
      unreadable ? [unreadable] : []
    ),
    findings: covered.flatMap(({ finding }) => (finding ? [finding] : []))
  }
}

const LOADS_LISTED = 5

/**
 * The load count and total overshoot carry the size of the defect, so the
 * per-load detail is capped: a report concentrating hundreds of over-exported
 * rows would otherwise emit a line long enough for the log pipeline to truncate
 * or drop, losing the detail entirely.
 *
 * @param {OverExportedLoadsFinding} finding
 * @returns {string}
 */
export const formatOverExportedLoadsFinding = (finding) => {
  const period = formatPeriodLabel(
    CADENCE.monthly,
    finding.period,
    finding.year
  )
  const remaining = finding.loads.length - LOADS_LISTED
  const loads = finding.loads
    .slice(0, LOADS_LISTED)
    .map(
      ({ rowId, received, exported }) =>
        `${rowId} received ${received} exported ${exported}`
    )
    .concat(remaining > 0 ? [`+${remaining} more`] : [])
    .join('; ')

  return [
    `Over-exported loads: org ${finding.organisationId} /`,
    `registration ${finding.registrationId}, report ${finding.reportId}`,
    `(${period}, ${finding.reportStatus}) - ${finding.loads.length} load(s),`,
    `overshoot ${finding.totalOvershoot} (${loads})`
  ].join(' ')
}

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
 * What one material accumulates as the findings are folded into it.
 * `registrationIds` carries duplicates until the rollup is finished, since an
 * exporter with several affected reports must still count once.
 *
 * @typedef {{
 *   loads: number,
 *   overshoot: RoundedTonnage,
 *   registrationIds: string[]
 * }} MaterialRollup
 */

/**
 * Rolled up by the registration's material, summed from the loads themselves.
 * Splitting a summary log's netted figure would fold away the very rows this
 * run exists to count.
 *
 * `loads` is the instance count: how many rows report more exported than
 * received. It is the figure the regulators are asking for, and it sums across
 * materials to the run's own `loads` total.
 *
 * @param {OverExportedLoadsFinding[]} findings
 */
export const summariseOverExportedLoadsByMaterial = (findings) =>
  Object.entries(
    findings.reduce((byMaterial, { material, registrationId, loads }) => {
      const running = byMaterial[material] ?? {
        loads: 0,
        registrationIds: [],
        overshoot: ZERO_TONNAGE
      }
      byMaterial[material] = {
        loads: running.loads + loads.length,
        registrationIds: [...running.registrationIds, registrationId],
        overshoot: loads.reduce(
          (sum, { overshoot }) => addTonnage(sum, toRoundedTonnage(overshoot)),
          running.overshoot
        )
      }
      return byMaterial
    }, /** @type {Record<string, MaterialRollup>} */ ({}))
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([material, { loads, registrationIds, overshoot }]) => ({
      material,
      loads,
      exporters: new Set(registrationIds).size,
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
