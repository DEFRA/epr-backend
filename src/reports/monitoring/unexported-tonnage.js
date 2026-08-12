import { calendarDate } from '#common/helpers/date-formatter.js'
import { isNil } from '#common/helpers/is-nil.js'
import {
  equals,
  greaterThan,
  isZero,
  subtract,
  toNumber
} from '#common/helpers/decimal-utils.js'
import {
  ZERO_TONNAGE,
  addTonnage,
  subtractTonnage,
  toRoundedTonnage
} from '#common/helpers/rounded-tonnage.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { OPERATOR_CATEGORY } from '#reports/domain/operator-category.js'
import { formatPeriodLabel } from '#reports/domain/period-labels.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY } from '#reports/domain/aggregation/fields-by-operator-category.js'
import {
  filterRecordsByDateField,
  isDateInRange
} from '#reports/domain/aggregation/filter-records-by-date.js'
import { wasteRecordStatesForHead } from '#waste-records/application/read-summary-log-row-states.js'

/**
 * @import { CalendarDate } from '#common/helpers/date-formatter.js'
 * @import { OrganisationsRepository } from '#repositories/organisations/port.js'
 * @import { PeriodicReport, ReportsRepository } from '#reports/repository/port.js'
 * @import { WasteRecordState } from '#waste-records/application/read-summary-log-row-states.js'
 * @import { SummaryLogRowStatesRepository } from '#waste-records/repository/port.js'
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
 *   year: number,
 *   period: number,
 *   reportStatus: string
 * }} FindingIdentity
 *
 * @typedef {FindingIdentity & {
 *   kind: typeof FINDING_KIND.MISMATCH,
 *   material: string,
 *   stored: number,
 *   recomputed: number,
 *   delta: number,
 *   rowsInPeriod: number,
 *   rowsUnexported: number,
 *   rowsOverExported: number,
 *   rowsMissingReceived: number,
 *   rowsMiscounted: number
 * }} MismatchFinding
 *
 * @typedef {FindingIdentity & {
 *   kind: typeof FINDING_KIND.SOURCE_MISSING,
 *   reason: string
 * }} SourceMissingFinding
 *
 * @typedef {FindingIdentity & {
 *   kind: typeof FINDING_KIND.RECOMPUTE_FAILED,
 *   reason: string
 * }} RecomputeFailedFinding
 *
 * @typedef {FindingIdentity & {
 *   kind: typeof FINDING_KIND.LOOKUP_FAILED,
 *   reason: string
 * }} LookupFailedFinding
 *
 * @typedef {MismatchFinding
 *   | SourceMissingFinding
 *   | RecomputeFailedFinding
 *   | LookupFailedFinding} UnexportedTonnageFinding
 *
 * The rows a report was built from together with the registration's material,
 * or the reason the rows are not there. A reason here means the data genuinely
 * is not present, which a re-run will not change — an error while reading is a
 * `LOOKUP_FAILED` finding instead. The material rides through so a resolved
 * report's mismatch lands in the right stream when the figures are split by
 * material; an unresolved report carries none, contributing no mismatch to split.
 *
 * The resolved branch's `material` is optional: production always supplies it,
 * but a direct caller diagnosing hand-built rows need not, and an absent one
 * reads as `unknown`.
 *
 * @typedef {{ states: WasteRecordState[], material?: string }
 *   | { unresolved: string }} SourceRowStates
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
 *   storedUnexported: number
 * }} ReviewableReportRow
 */

/**
 * What a finding says about its report: the stored figure disagrees with the
 * corrected rule, the source rows are not there to recompute from, they were
 * resolved but could not be read as tonnages, or reading them failed outright.
 *
 * The last is kept apart from the others because it says nothing about the
 * exporter's data — a Mongo timeout or a report deleted mid-scan is a fact
 * about the run, and a re-run may well resolve it. Folding those into
 * `SOURCE_MISSING` would inflate the population the business is told it cannot
 * account for.
 */
export const FINDING_KIND = Object.freeze({
  MISMATCH: 'mismatch',
  SOURCE_MISSING: 'source-missing',
  RECOMPUTE_FAILED: 'recompute-failed',
  LOOKUP_FAILED: 'lookup-failed'
})

/** @typedef {(typeof FINDING_KIND)[keyof typeof FINDING_KIND]} FindingKind */

/** @type {Set<string>} */
const REVIEWABLE_REPORT_STATUSES = new Set([
  REPORT_STATUS.SUBMITTED,
  REPORT_STATUS.IN_PROGRESS,
  REPORT_STATUS.READY_TO_SUBMIT
])

const RECEIVED_DATE_FIELD =
  SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY[OPERATOR_CATEGORY.EXPORTER]
    .wasteReceived

const EXPORT_DATE_FIELD =
  SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY[OPERATOR_CATEGORY.EXPORTER]
    .wasteExported

const TONNAGE_RECEIVED_FIELD = 'TONNAGE_RECEIVED_FOR_EXPORT'
const TONNAGE_EXPORTED_FIELD = 'TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED'

/**
 * The monthly reports this diagnostic reviews, flattened out of the
 * estate-wide periodic report groupings.
 *
 * Only monthly reports are read, which is what confines the population to
 * accredited exporters: a registration reports monthly once it holds an
 * accreditation number and quarterly before that, so a registered-only
 * exporter's hand-typed figure only ever lands on a quarterly report. A
 * reprocessor has no export activity at all, and its figure reads as null.
 *
 * @param {PeriodicReport[]} periodicReports
 * @returns {ReviewableReportRow[]}
 */
export const findReviewableReportRows = (periodicReports) =>
  periodicReports.flatMap(({ organisationId, registrationId, year, reports }) =>
    Object.entries(reports.monthly ?? {}).flatMap(([period, periodInfo]) => {
      const { current } = periodInfo
      if (!current || !REVIEWABLE_REPORT_STATUSES.has(current.status)) {
        return []
      }
      const storedUnexported =
        current.exportActivity?.tonnageReceivedNotExported
      if (isNil(storedUnexported)) {
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
          storedUnexported
        }
      ]
    })
  )

/**
 * A load's contribution to the figure: the tonnage received for export that has
 * not yet been exported, and what is wrong with the row if anything.
 *
 * Every field on the exporter received-loads table is optional, so a blank
 * received tonnage is possible and reads as zero. Left alone that row would
 * present as having exported more than it received, which is a different defect
 * with a different remedy — the business is being asked to rule on genuine
 * over-exports, so a blank is counted as its own thing rather than folded in.
 *
 * The contribution is clamped at zero for both, since neither is a negative
 * amount on site. How an over-exporting row should be handled at all is still
 * open with the business, so the sizing run takes the conservative reading and
 * counts the rows so the decision has a number behind it.
 *
 * @param {Record<string, any>} data
 * @returns {{
 *   notExported: import('#common/helpers/rounded-tonnage.js').RoundedTonnage,
 *   overExported: boolean,
 *   missingReceived: boolean
 * }}
 */
const classifyLoad = (data) => {
  const exported = toRoundedTonnage(data[TONNAGE_EXPORTED_FIELD])
  if (isNil(data[TONNAGE_RECEIVED_FIELD])) {
    return {
      notExported: ZERO_TONNAGE,
      overExported: false,
      missingReceived: true
    }
  }

  const received = toRoundedTonnage(data[TONNAGE_RECEIVED_FIELD])
  return greaterThan(exported, received)
    ? { notExported: ZERO_TONNAGE, overExported: true, missingReceived: false }
    : {
        notExported: subtractTonnage(received, exported),
        overExported: false,
        missingReceived: false
      }
}

/**
 * What the live calculation scores a load at: nothing if its export date falls
 * in the reporting period, otherwise the whole tonnage received. Export *date*
 * standing in for export *tonnage* is the bug being sized.
 *
 * This is the only place the faulty rule is reproduced, and it exists solely so
 * a run can say how many rows the fix moves. It is meaningful on the sizing run
 * and meaningless afterwards — once the fix lands, production no longer behaves
 * this way, and `rowsMiscounted` describes history rather than the estate.
 *
 * @param {Record<string, any>} data
 * @param {CalendarDate} startDate
 * @param {CalendarDate} endDate
 * @returns {import('#common/helpers/rounded-tonnage.js').RoundedTonnage}
 */
const liveContribution = (data, startDate, endDate) =>
  isDateInRange(data[EXPORT_DATE_FIELD], startDate, endDate)
    ? ZERO_TONNAGE
    : toRoundedTonnage(data[TONNAGE_RECEIVED_FIELD])

/**
 * @typedef {{
 *   total: number,
 *   rowsInPeriod: number,
 *   rowsUnexported: number,
 *   rowsOverExported: number,
 *   rowsMissingReceived: number,
 *   rowsMiscounted: number
 * }} Recomputation
 */

/**
 * The corrected figure for a period: per load received in that period, column S
 * minus column T, summed. Unlike the live calculation, no load is dropped for
 * carrying an export date.
 *
 * Reports the rows behind the figure alongside it, so a finding says how much
 * data a backfill would move and not only how much tonnage.
 *
 * @param {WasteRecordState[]} wasteRecordStates
 * @param {CalendarDate} startDate
 * @param {CalendarDate} endDate
 * @returns {Recomputation}
 */
const recomputeUnexported = (wasteRecordStates, startDate, endDate) => {
  const loads = filterRecordsByDateField(
    wasteRecordStates,
    RECEIVED_DATE_FIELD,
    startDate,
    endDate
  ).map(({ data }) => ({
    ...classifyLoad(data),
    live: liveContribution(data, startDate, endDate)
  }))

  return {
    total: toNumber(
      loads.reduce(
        (sum, { notExported }) => addTonnage(sum, notExported),
        ZERO_TONNAGE
      )
    ),
    rowsInPeriod: loads.length,
    rowsUnexported: loads.filter(({ notExported }) => !isZero(notExported))
      .length,
    rowsOverExported: loads.filter(({ overExported }) => overExported).length,
    rowsMissingReceived: loads.filter(({ missingReceived }) => missingReceived)
      .length,
    rowsMiscounted: loads.filter(
      ({ notExported, live }) => !equals(live, notExported)
    ).length
  }
}

/**
 * @param {ReviewableReportRow} row
 * @returns {FindingIdentity}
 */
const identityOf = (row) => ({
  organisationId: row.organisationId,
  registrationId: row.registrationId,
  reportId: row.reportId,
  year: row.year,
  period: row.period,
  reportStatus: row.reportStatus
})

/**
 * Compares a report's stored figure against a fresh recomputation under the
 * corrected rule. Returns null when they already agree — the report the fix
 * would leave untouched.
 *
 * `sourceRowStates` carries a reason instead of rows when the report's source
 * rows are not there, which is the one case a backfill could not correct on its
 * own. The reason rides onto the finding so the reader knows which of the
 * causes they are looking at.
 *
 * @param {ReviewableReportRow} row
 * @param {SourceRowStates} sourceRowStates
 * @returns {UnexportedTonnageFinding | null}
 */
export const diagnoseReportRow = (row, sourceRowStates) => {
  if ('unresolved' in sourceRowStates) {
    return {
      kind: FINDING_KIND.SOURCE_MISSING,
      ...identityOf(row),
      reason: sourceRowStates.unresolved
    }
  }

  let recomputation
  try {
    recomputation = recomputeUnexported(
      sourceRowStates.states,
      calendarDate(row.startDate),
      calendarDate(row.endDate)
    )
  } catch (error) {
    return {
      kind: FINDING_KIND.RECOMPUTE_FAILED,
      ...identityOf(row),
      reason: /** @type {Error} */ (error).message
    }
  }

  const { total, ...rowCounts } = recomputation
  if (equals(total, row.storedUnexported)) {
    return null
  }

  return {
    kind: FINDING_KIND.MISMATCH,
    ...identityOf(row),
    material: sourceRowStates.material ?? UNKNOWN_MATERIAL,
    stored: row.storedUnexported,
    recomputed: total,
    delta: toNumber(subtract(total, row.storedUnexported)),
    ...rowCounts
  }
}

/**
 * The part of a log line that differs by kind: the figures for a mismatch, and
 * for every other kind the reason nothing could be computed.
 *
 * @param {UnexportedTonnageFinding} finding
 * @returns {string}
 */
const detailOf = (finding) =>
  finding.kind === FINDING_KIND.MISMATCH
    ? `stored ${finding.stored}, recomputed ${finding.recomputed}, ` +
      `delta ${finding.delta}, rows ${finding.rowsInPeriod} in period / ` +
      `${finding.rowsMiscounted} miscounted / ` +
      `${finding.rowsUnexported} unexported / ` +
      `${finding.rowsOverExported} over-exported / ` +
      `${finding.rowsMissingReceived} missing received`
    : finding.reason

/**
 * Renders a finding as one reviewable log line.
 *
 * @param {UnexportedTonnageFinding} finding
 * @returns {string}
 */
export const formatUnexportedTonnageFinding = (finding) =>
  `Unexported tonnage ${finding.kind}: org ${finding.organisationId} / ` +
  `registration ${finding.registrationId}, report ${finding.reportId} ` +
  `(${formatPeriodLabel(CADENCE.monthly, finding.period, finding.year)}, ` +
  `${finding.reportStatus}) - ${detailOf(finding)}`

/**
 * The mismatches among a set of findings — the reports a backfill could correct
 * in place, and the only ones carrying figures to total.
 *
 * @param {UnexportedTonnageFinding[]} findings
 * @returns {MismatchFinding[]}
 */
const mismatchesOf = (findings) =>
  /** @type {MismatchFinding[]} */ (
    findings.filter(({ kind }) => kind === FINDING_KIND.MISMATCH)
  )

/**
 * @param {UnexportedTonnageFinding[]} findings
 * @param {keyof FindingIdentity} field
 * @returns {number}
 */
const distinctCount = (findings, field) =>
  new Set(findings.map((finding) => finding[field])).size

/**
 * The tonnage a set of mismatches moves, split by direction. Reporting the two
 * halves alongside the net keeps a month whose understatements and
 * overstatements cancel from reading as a month with nothing wrong in it.
 *
 * `overstated` is returned positive — it is an amount of tonnage, not a signed
 * correction.
 *
 * @param {MismatchFinding[]} mismatches
 * @returns {{ delta: number, understated: number, overstated: number }}
 */
const deltaTotalsOf = (mismatches) => {
  const sum = (subset) =>
    subset.reduce(
      (total, { delta }) => addTonnage(total, toRoundedTonnage(delta)),
      ZERO_TONNAGE
    )
  const understated = sum(mismatches.filter(({ delta }) => delta > 0))
  const overstated = sum(mismatches.filter(({ delta }) => delta < 0))

  return {
    delta: toNumber(addTonnage(understated, overstated)),
    understated: toNumber(understated),
    overstated: toNumber(subtract(ZERO_TONNAGE, overstated))
  }
}

/**
 * @typedef {{
 *   material: string,
 *   reports: number,
 *   delta: number,
 *   understated: number,
 *   overstated: number
 * }} MaterialBreakdown
 */

/**
 * A set of mismatches broken down by the material their registration carries,
 * alphabetically. The unit shared by the standalone by-material breakdown and the
 * per-material split nested inside each month, so both read the tonnage the same
 * way. Every mismatch carries a material — an absent one resolves to `unknown`
 * upstream — so no mismatch falls out of the breakdown.
 *
 * @param {MismatchFinding[]} mismatches
 * @returns {MaterialBreakdown[]}
 */
const byMaterialOf = (mismatches) =>
  [...Map.groupBy(mismatches, ({ material }) => material).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([material, group]) => ({
      material,
      reports: group.length,
      ...deltaTotalsOf(group)
    }))

const MONTHS_IN_YEAR = 12

/**
 * The correctable tonnage broken down by the month each report covers, oldest
 * first — the shape the business asked the sizing run for. Only mismatches
 * carry a figure, so the other finding kinds contribute no months.
 *
 * Each month carries a `byMaterial` split of its own mismatches, so a month's
 * total can be read down to the stream it came from without crossing the whole
 * estate against a second breakdown by hand.
 *
 * @param {UnexportedTonnageFinding[]} findings
 * @returns {{
 *   month: string,
 *   reports: number,
 *   delta: number,
 *   understated: number,
 *   overstated: number,
 *   byMaterial: MaterialBreakdown[]
 * }[]}
 */
export const summariseUnexportedTonnageByMonth = (findings) =>
  [
    ...Map.groupBy(
      mismatchesOf(findings),
      ({ year, period }) => year * MONTHS_IN_YEAR + period
    ).entries()
  ]
    .sort(([a], [b]) => a - b)
    .map(([, mismatches]) => ({
      month: formatPeriodLabel(
        CADENCE.monthly,
        mismatches[0].period,
        mismatches[0].year
      ),
      reports: mismatches.length,
      ...deltaTotalsOf(mismatches),
      byMaterial: byMaterialOf(mismatches)
    }))

/**
 * The correctable tonnage broken down by the material each report's registration
 * carries, alphabetically. The estate-wide counterpart to the per-material split
 * nested inside each month, for reading the total against one stream at a time.
 * Only mismatches carry a figure, so the other finding kinds contribute no
 * materials.
 *
 * @param {UnexportedTonnageFinding[]} findings
 * @returns {MaterialBreakdown[]}
 */
export const summariseUnexportedTonnageByMaterial = (findings) =>
  byMaterialOf(mismatchesOf(findings))

/**
 * The mismatches split by the status their report sits in. A submitted report
 * is one a regulator has already read, so correcting it means a resubmission;
 * a draft is regenerated on its own and needs nothing beyond the fix. That
 * split is the operational decision the ticket leaves open, so the sizing run
 * reports it rather than a single total.
 *
 * @param {UnexportedTonnageFinding[]} findings
 * @returns {Record<string, number>}
 */
export const summariseUnexportedTonnageByStatus = (findings) => {
  const mismatches = mismatchesOf(findings)

  return Object.fromEntries(
    [...REVIEWABLE_REPORT_STATUSES].map((status) => [
      status,
      mismatches.filter(({ reportStatus }) => reportStatus === status).length
    ])
  )
}

/**
 * The biggest corrections the fix would make, largest first, ranked on size
 * rather than direction. Distinguishes one outlier report from a drift spread
 * across the estate without reading every finding line.
 *
 * @param {UnexportedTonnageFinding[]} findings
 * @param {number} limit
 * @returns {{ reportId: string, month: string, delta: number }[]}
 */
export const largestUnexportedTonnageDeltas = (findings, limit) =>
  mismatchesOf(findings)
    .toSorted((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit)
    .map(({ reportId, period, year, delta }) => ({
      reportId,
      month: formatPeriodLabel(CADENCE.monthly, period, year),
      delta
    }))

/**
 * The scale figures the run's summary line reports. `totalDelta` and the row
 * counts cover the mismatches only — the tonnage and data a backfill would move.
 *
 * An exporter is one accredited exporter registration, which is the unit the
 * regulator deals with; an organisation may hold more than one. Both are
 * counted over the mismatches alone, so a report whose rows could not be
 * resolved does not present as a known-wrong exporter — those are reported
 * separately as `unresolvedExporters`, the population whose size is unknown
 * rather than zero.
 *
 * @param {UnexportedTonnageFinding[]} findings
 * @returns {{
 *   mismatches: number,
 *   sourceMissing: number,
 *   recomputeFailed: number,
 *   lookupFailed: number,
 *   affectedExporters: number,
 *   affectedOrganisations: number,
 *   unresolvedExporters: number,
 *   rowsInPeriod: number,
 *   rowsUnexported: number,
 *   rowsOverExported: number,
 *   rowsMissingReceived: number,
 *   rowsMiscounted: number,
 *   totalDelta: number,
 *   totalUnderstated: number,
 *   totalOverstated: number
 * }}
 */
export const summariseUnexportedTonnageFindings = (findings) => {
  const countOf = (kind) => findings.filter((f) => f.kind === kind).length
  const mismatches = mismatchesOf(findings)
  const unresolved = findings.filter(
    ({ kind }) => kind !== FINDING_KIND.MISMATCH
  )
  const sumOf = (field) =>
    mismatches.reduce((total, finding) => total + finding[field], 0)
  const { delta, understated, overstated } = deltaTotalsOf(mismatches)

  return {
    mismatches: mismatches.length,
    sourceMissing: countOf(FINDING_KIND.SOURCE_MISSING),
    recomputeFailed: countOf(FINDING_KIND.RECOMPUTE_FAILED),
    lookupFailed: countOf(FINDING_KIND.LOOKUP_FAILED),
    affectedExporters: distinctCount(mismatches, 'registrationId'),
    affectedOrganisations: distinctCount(mismatches, 'organisationId'),
    unresolvedExporters: distinctCount(unresolved, 'registrationId'),
    rowsInPeriod: sumOf('rowsInPeriod'),
    rowsUnexported: sumOf('rowsUnexported'),
    rowsOverExported: sumOf('rowsOverExported'),
    rowsMissingReceived: sumOf('rowsMissingReceived'),
    rowsMiscounted: sumOf('rowsMiscounted'),
    totalDelta: delta,
    totalUnderstated: understated,
    totalOverstated: overstated
  }
}

/**
 * The ledgers a registration's uploads may sit under: null (its registered-only
 * phase) and its current accreditation id. Reading both means a report built
 * before accreditation still resolves its rows. A row commits under exactly one
 * ledger, so concatenating the two yields the submission's rows without
 * duplication.
 *
 * Only the registration's *current* accreditation is probed, so a report built
 * under an accreditation that has since been superseded resolves no rows and
 * reads as source-missing. Reaching those would need the accreditation history,
 * which the sizing run does not carry.
 *
 * Errors propagate: a registration that cannot be read is a fact about the run,
 * not about the exporter's data, and the caller records it as such.
 *
 * Reads the registration's material off the same fetch, so a resolved report's
 * mismatch can be split by stream without a second lookup.
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {string} organisationId
 * @param {string} registrationId
 * @returns {Promise<{
 *   ledgers: import('#waste-records/repository/port.js').WasteBalanceLedgerId[],
 *   material: string
 * }>}
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

  return {
    ledgers: accreditationIds.map((accreditationId) => ({
      organisationId,
      registrationId,
      accreditationId
    })),
    material: registration?.material ?? UNKNOWN_MATERIAL
  }
}

const NO_SUMMARY_LOG = 'no source summary log recorded on the report'
const NO_ROWS = 'no rows found under the registration ledgers'

/**
 * The bucket a mismatch lands in when its registration carries no material. A
 * material is logged as its raw lowercase code (`plastic`, `steel`), so the
 * sentinel is parenthesised to read plainly as "unresolved" rather than as a
 * stream literally named that, and to sort clear of the real codes.
 */
const UNKNOWN_MATERIAL = '(material unknown)'

/**
 * The row states the report was built from, or the reason there are none. Both
 * reasons are statements about the stored data rather than about this run, so
 * either one is stable across re-runs; anything that throws on the way is not,
 * and is left to propagate.
 *
 * @param {{
 *   reportsRepository: ReportsRepository,
 *   organisationsRepository: OrganisationsRepository,
 *   summaryLogRowStatesRepository: SummaryLogRowStatesRepository
 * }} deps
 * @param {ReviewableReportRow} row
 * @returns {Promise<SourceRowStates>}
 */
const loadSourceRowStates = async (
  { reportsRepository, organisationsRepository, summaryLogRowStatesRepository },
  row
) => {
  const report = await reportsRepository.findReportById(row.reportId)
  const summaryLogId = report.source?.summaryLogId ?? null
  if (summaryLogId === null) {
    return { unresolved: NO_SUMMARY_LOG }
  }

  const { ledgers, material } = await resolveLedgers(
    organisationsRepository,
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

  return states.length > 0 ? { states, material } : { unresolved: NO_ROWS }
}

/**
 * Scans every reviewable accredited-exporter monthly report across the estate
 * and returns the ones whose stored unexported tonnage disagrees with the
 * corrected rule, alongside those that cannot be recomputed at all. Read-only.
 *
 * A report is read individually after the estate-wide snapshot is taken, so one
 * of them going away under live traffic — or any transient read failure — is
 * expected rather than exceptional. Each is contained to its own finding: a
 * single failure must not cost the run every figure it has already computed,
 * since the diagnostic gets one pass per deploy.
 *
 * @param {{
 *   reportsRepository: ReportsRepository,
 *   organisationsRepository: OrganisationsRepository,
 *   summaryLogRowStatesRepository: SummaryLogRowStatesRepository
 * }} deps
 * @returns {Promise<{ scanned: number, findings: UnexportedTonnageFinding[] }>}
 */
export const findUnexportedTonnageReports = async (deps) => {
  const periodicReports = await deps.reportsRepository.findAllPeriodicReports()
  const rows = findReviewableReportRows(periodicReports)

  const findings = []
  for (const row of rows) {
    try {
      const finding = diagnoseReportRow(
        row,
        await loadSourceRowStates(deps, row)
      )
      if (finding) {
        findings.push(finding)
      }
    } catch (error) {
      findings.push({
        kind: FINDING_KIND.LOOKUP_FAILED,
        ...identityOf(row),
        reason: /** @type {Error} */ (error).message
      })
    }
  }

  return { scanned: rows.length, findings }
}
