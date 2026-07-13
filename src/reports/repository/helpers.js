import { calendarDate } from '#common/helpers/date-formatter.js'
import {
  REPORT_STATUS,
  REPORT_STATUS_SLOT
} from '#reports/domain/report-status.js'
import { periodKey } from '#reports/domain/period-key.js'
import { randomUUID } from 'node:crypto'

const BARE_DATE_LENGTH = 10

/**
 * Only reports persisted before the bare-date schema fix carry a full ISO
 * datetime here (historical Joi coercion); new reports are already bare, so
 * this only does work for the old-shape case. Safe to delete once no
 * pre-fix reports remain.
 * @param {string} dateString
 * @returns {string}
 */
const backCompatCalendarDate = (dateString) =>
  dateString.length > BARE_DATE_LENGTH ? calendarDate(dateString) : dateString

/**
 * Picks the latest submission (highest submissionNumber) per reporting period
 * from a flat list of report-like documents. Shared by the in-memory and
 * mongodb adapters so the "latest per period" rule lives in one place.
 *
 * Invariant: `submissionNumber` is unique per period among submitted reports
 * (each resubmission increments it), so the highest value identifies a single
 * report. Ties are not expected; if two shared a submissionNumber the tie-break
 * would fall to input order, which is not a meaningful ordering here.
 *
 * @template {{ year: number, cadence: string, period: number, submissionNumber: number }} T
 * @param {T[]} reports
 * @returns {T[]}
 */
export const latestSubmissionPerPeriod = (reports) => [
  ...[...reports]
    .sort((a, b) => b.submissionNumber - a.submissionNumber)
    .reduce((latest, report) => {
      const key = periodKey(report)
      if (!latest.has(key)) {
        latest.set(key, report)
      }
      return latest
    }, /** @type {Map<string, T>} */ (new Map()))
    .values()
]

/**
 * Groups `arr` by `keyFn`, then maps each group through `valueFn`.
 *
 * @template T, V
 * @param {T[]} arr
 * @param {(item: T) => string} keyFn
 * @param {(group: T[]) => V} valueFn
 * @returns {Record<string, V>}
 */
const groupTransform = (arr, keyFn, valueFn) =>
  Object.fromEntries(
    Object.entries(Object.groupBy(arr, keyFn)).map(([k, v]) => [
      k,
      valueFn(/** @type {T[]} */ (v))
    ])
  )

/**
 * Groups raw report documents into the PeriodicReport nested structure.
 *
 * Sorts by submissionNumber descending so the latest submission is processed first.
 * The highest-numbered report becomes `current`;
 * all previous submitted reports are collected in `previousSubmissions`.
 *
 * @param {string} organisationId
 * @param {string} registrationId
 * @param {Object[]} docs
 * @returns {import('./port.js').PeriodicReport[]}
 */
export const groupAsPeriodicReports = (
  organisationId,
  registrationId,
  docs
) => {
  const toSubmission = (doc) => ({
    id: doc.id,
    status: doc.status.currentStatus,
    submissionNumber: doc.submissionNumber,
    submittedAt: doc.status.submitted?.at ?? null,
    submittedBy: doc.status.submitted?.by ?? null,
    resubmissionRequired: doc.resubmissionRequired ?? null,
    recyclingActivity: {
      totalTonnageReceived: doc.recyclingActivity?.totalTonnageReceived,
      tonnageRecycled: doc.recyclingActivity?.tonnageRecycled,
      tonnageNotRecycled: doc.recyclingActivity?.tonnageNotRecycled
    },
    exportActivity: doc.exportActivity
      ? {
          totalTonnageExported: doc.exportActivity.totalTonnageExported,
          tonnageReceivedNotExported:
            doc.exportActivity.tonnageReceivedNotExported,
          tonnageRefusedAtDestination:
            doc.exportActivity.tonnageRefusedAtDestination,
          tonnageStoppedDuringExport:
            doc.exportActivity.tonnageStoppedDuringExport,
          tonnageRepatriated: doc.exportActivity.tonnageRepatriated
        }
      : undefined,
    wasteSent: {
      tonnageSentToReprocessor: doc.wasteSent?.tonnageSentToReprocessor,
      tonnageSentToExporter: doc.wasteSent?.tonnageSentToExporter,
      tonnageSentToAnotherSite: doc.wasteSent?.tonnageSentToAnotherSite
    },
    prn: doc.prn
      ? {
          issuedTonnage: doc.prn.issuedTonnage,
          freeTonnage: doc.prn.freeTonnage,
          totalRevenue: doc.prn.totalRevenue,
          averagePricePerTonne: doc.prn.averagePricePerTonne
        }
      : undefined,
    supportingInformation: doc.supportingInformation
  })

  const buildPeriodSummary = (periodDocs) => {
    const [first, ...rest] = [...periodDocs].sort(
      (a, b) => b.submissionNumber - a.submissionNumber
    )
    const { startDate, endDate, dueDate } = first
    return {
      startDate: backCompatCalendarDate(startDate),
      endDate: backCompatCalendarDate(endDate),
      dueDate: backCompatCalendarDate(dueDate),
      current: toSubmission(first),
      previousSubmissions: rest.map(toSubmission)
    }
  }

  const byYear = Object.groupBy(docs, (doc) => doc.year)
  return Object.entries(byYear).map(([year, yearDocs]) => ({
    organisationId,
    registrationId,
    year: Number(year),
    reports: groupTransform(
      /** @type {Object[]} */ (yearDocs),
      (doc) => doc.cadence,
      (cadenceDocs) =>
        groupTransform(cadenceDocs, (doc) => doc.period, buildPeriodSummary)
    )
  }))
}

/**
 * Groups raw reports and transforms them into periodic reports.
 * @param {import('./port.js').Report[]} reports
 * @returns {import('./port.js').PeriodicReport[]}
 */
export const transformToPeriodicReports = (reports) => {
  const grouped = reports.reduce((acc, report) => {
    const key = `${report.organisationId}::${report.registrationId}`
    acc[key] ??= []
    acc[key].push(report)
    return acc
  }, {})

  return Object.values(grouped).flatMap((group) => {
    const { organisationId, registrationId } = group[0]
    return groupAsPeriodicReports(organisationId, registrationId, group)
  })
}

/** @type {import('./port.js').Report} */
/**
 * @param {import('./port.js').CreateReportParams} validatedParams
 * @returns {import('./port.js').Report}
 */
export const prepareCreateReportParams = (validatedParams) => {
  const { changedBy, ...reportCreateParams } = validatedParams

  const providedReportParams = Object.fromEntries(
    Object.entries(reportCreateParams).filter(
      ([_, value]) => value !== undefined
    )
  )
  const now = new Date().toISOString()
  const reportId = randomUUID()

  return /** @type {import('./port.js').Report} */ ({
    id: reportId,
    version: 1,
    schemaVersion: 1,
    ...providedReportParams,
    status: {
      currentStatus: REPORT_STATUS.IN_PROGRESS,
      currentStatusAt: now,
      [REPORT_STATUS_SLOT.CREATED]: { at: now, by: changedBy },
      history: [{ status: REPORT_STATUS.IN_PROGRESS, at: now, by: changedBy }]
    }
  })
}
