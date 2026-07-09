import { endOfDay, startOfDay } from '#common/helpers/date-formatter.js'
import { isNil } from '#common/helpers/is-nil.js'
import { CANCELLED_PRN_STATUSES } from '#packaging-recycling-notes/domain/model.js'
import { aggregateIssuedTonnage } from '#packaging-recycling-notes/domain/tonnage.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { formatPeriodLabel } from '#reports/domain/period-labels.js'

/** @type {Set<import('#reports/domain/report-status.js').ReportStatus>} */
const REVIEWABLE_REPORT_STATUSES = new Set([
  REPORT_STATUS.SUBMITTED,
  REPORT_STATUS.IN_PROGRESS,
  REPORT_STATUS.READY_TO_SUBMIT
])

/**
 * Sum of tonnage for PRNs issued within the period but currently cancelled or
 * awaiting cancellation — the PAE-1665 mechanism that stales a report's
 * previously-computed issuedTonnage.
 *
 * @param {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote[]} prns
 * @param {{ startDate: Date, endDate: Date }} period
 * @returns {number}
 */
const issuedButLaterCancelledTonnage = (prns, { startDate, endDate }) => {
  const isInPeriod = (at) => !isNil(at) && at >= startDate && at <= endDate

  return prns
    .filter((prn) => isInPeriod(prn.status.issued?.at))
    .filter((prn) => CANCELLED_PRN_STATUSES.has(prn.status.currentStatus))
    .reduce((total, prn) => total + prn.tonnage, 0)
}

/**
 * Submitted, in-progress, or ready-to-submit monthly report rows extracted
 * from the estate-wide periodic report groupings, flattened to the fields
 * this diagnostic needs.
 *
 * @param {import('#reports/repository/port.js').PeriodicReport[]} periodicReports
 * @returns {Array<{
 *   organisationId: string,
 *   registrationId: string,
 *   year: number,
 *   period: number,
 *   startDate: string,
 *   endDate: string,
 *   reportId: string,
 *   reportStatus: string,
 *   storedIssuedTonnage: number
 * }>}
 */
export const findReviewableMonthlyReportRows = (periodicReports) =>
  periodicReports.flatMap(({ organisationId, registrationId, year, reports }) =>
    Object.entries(reports.monthly ?? {}).flatMap(([period, periodInfo]) => {
      const { current } = periodInfo
      if (!current || !REVIEWABLE_REPORT_STATUSES.has(current.status)) {
        return []
      }
      if (isNil(current.prn?.issuedTonnage)) {
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
          storedIssuedTonnage: current.prn.issuedTonnage
        }
      ]
    })
  )

/**
 * Compares a report row's stored issuedTonnage against a fresh recalculation
 * from the current PRN state. Returns null when they match (nothing to
 * report); otherwise returns the finding to log.
 *
 * @param {ReturnType<typeof findReviewableMonthlyReportRows>[number]} row
 * @param {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote[]} prns
 * @returns {{
 *   organisationId: string,
 *   registrationId: string,
 *   reportId: string,
 *   month: string,
 *   reportStatus: string,
 *   storedIssuedTonnage: number,
 *   recalculatedTonnage: number,
 *   issuedButLaterCancelledTonnage: number
 * } | null}
 */
export const diagnoseReportRow = (row, prns) => {
  const period = {
    startDate: startOfDay(row.startDate),
    endDate: endOfDay(row.endDate)
  }
  const recalculatedTonnage = aggregateIssuedTonnage(prns, period)

  if (recalculatedTonnage === row.storedIssuedTonnage) {
    return null
  }

  return {
    organisationId: row.organisationId,
    registrationId: row.registrationId,
    reportId: row.reportId,
    month: formatPeriodLabel('monthly', row.period, row.year),
    reportStatus: row.reportStatus,
    storedIssuedTonnage: row.storedIssuedTonnage,
    recalculatedTonnage,
    issuedButLaterCancelledTonnage: issuedButLaterCancelledTonnage(prns, period)
  }
}

/**
 * Renders a stale-issued-tonnage finding as a single reviewable log line.
 *
 * @param {NonNullable<ReturnType<typeof diagnoseReportRow>>} finding
 * @returns {string}
 */
export const formatStaleIssuedTonnageFinding = (finding) =>
  `Stale issued tonnage: org ${finding.organisationId} / registration ${finding.registrationId}, ` +
  `report ${finding.reportId} (${finding.month}, ${finding.reportStatus}) — ` +
  `stored ${finding.storedIssuedTonnage}, recalculated ${finding.recalculatedTonnage}, ` +
  `issued-but-later-cancelled ${finding.issuedButLaterCancelledTonnage}`

/**
 * Scans every submitted, in-progress, or ready-to-submit monthly report
 * across the estate, recalculates issuedTonnage from the current PRN state,
 * and returns the reports whose stored value no longer matches. Read-only.
 *
 * @param {Object} params
 * @param {import('#reports/repository/port.js').ReportsRepository} params.reportsRepository
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} params.organisationsRepository
 * @param {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} params.packagingRecyclingNotesRepository
 * @returns {Promise<{ scanned: number, findings: NonNullable<ReturnType<typeof diagnoseReportRow>>[] }>}
 */
export const findStaleIssuedTonnageReports = async ({
  reportsRepository,
  organisationsRepository,
  packagingRecyclingNotesRepository
}) => {
  const periodicReports = await reportsRepository.findAllPeriodicReports()
  const rows = findReviewableMonthlyReportRows(periodicReports)

  const prnsByAccreditationId = new Map()
  const findings = []

  for (const row of rows) {
    let registration
    try {
      registration = await organisationsRepository.findRegistrationById(
        row.organisationId,
        row.registrationId
      )
    } catch {
      continue
    }

    const accreditationId = registration?.accreditationId
    if (!accreditationId) {
      continue
    }

    if (!prnsByAccreditationId.has(accreditationId)) {
      prnsByAccreditationId.set(
        accreditationId,
        await packagingRecyclingNotesRepository.findByAccreditation(
          accreditationId
        )
      )
    }
    const prns = prnsByAccreditationId.get(accreditationId)

    const finding = diagnoseReportRow(row, prns)
    if (finding) {
      findings.push(finding)
    }
  }

  return { scanned: rows.length, findings }
}
