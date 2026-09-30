import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'
import { getStatusHistoryDateTimes } from '#common/helpers/dates/accreditation.js'
import { ACCREDITATION_STATUS } from '#domain/organisations/model.js'
import { CADENCE } from '#reports/domain/cadence.js'

/** @import { Accreditation } from '#domain/organisations/accreditation.js' */
/** @import { Cadence } from '#reports/domain/cadence.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { PeriodicReport, ReportsRepository } from '#reports/repository/port.js' */
/** @import { ReportStatus } from '#reports/domain/report-status.js' */

/**
 * @typedef {Object} CancelledAccreditationReportRow
 * @property {string} registrationId
 * @property {Cadence} cadence
 * @property {number} year
 * @property {number} period
 * @property {number} submissionNumber
 * @property {ReportStatus} status
 * @property {string | null} submittedAt
 */

/**
 * @typedef {Object} CancelledAccreditationRow
 * @property {string} organisationId
 * @property {number} orgId
 * @property {boolean} testOrganisation
 * @property {string} accreditationId
 * @property {string | null} accreditationNumber
 * @property {Accreditation['material']} material
 * @property {string | null} validFrom
 * @property {string | null} validTo
 * @property {string | null} cancelledAt - ISO timestamp of the latest
 *   cancellation in the status history
 * @property {number} linkedRegistrations
 * @property {CancelledAccreditationReportRow[]} reports - ordered by year,
 *   cadence, period and submission
 */

/**
 * @typedef {Object} CancelledAccreditationReportsSummary
 * @property {number} scannedOrganisations
 * @property {number} scannedAccreditations
 * @property {number} cancelledAccreditations
 * @property {number} reports
 */

/**
 * @typedef {Object} CancelledAccreditationReportsReport
 * @property {CancelledAccreditationRow[]} rows
 * @property {CancelledAccreditationReportsSummary} summary
 */

/**
 * @param {Accreditation} accreditation
 * @returns {string | null}
 */
const cancelledAt = (accreditation) => {
  const latest = getStatusHistoryDateTimes(accreditation.statusHistory).find(
    ({ status }) => status === ACCREDITATION_STATUS.CANCELLED
  )
  return latest ? new Date(latest.updatedAt).toISOString() : null
}

/**
 * @param {PeriodicReport} periodicReport
 * @returns {CancelledAccreditationReportRow[]}
 */
const reportRowsOf = ({ registrationId, year, reports }) =>
  Object.values(CADENCE).flatMap((cadence) =>
    Object.entries(reports[cadence] ?? {}).flatMap(([period, slot]) =>
      [slot.current, ...slot.previousSubmissions]
        .filter((report) => report !== null)
        .map((report) => ({
          registrationId,
          cadence,
          year,
          period: Number(period),
          submissionNumber: report.submissionNumber,
          status: report.status,
          submittedAt: report.submittedAt
        }))
    )
  )

/**
 * @param {CancelledAccreditationReportRow} a
 * @param {CancelledAccreditationReportRow} b
 */
const byYearCadencePeriodSubmission = (a, b) =>
  a.year - b.year ||
  a.cadence.localeCompare(b.cadence) ||
  a.period - b.period ||
  a.submissionNumber - b.submissionNumber

/**
 * Lists every cancelled accreditation with every report its registration
 * holds, monthly and quarterly, current and superseded, so it can be seen
 * which monthly reports were filed before the cancellation turned its
 * calendar quarterly. Reports belong to the registration, so each
 * accreditation reaches them through the registrations linked to it.
 *
 * @param {Organisation[]} organisations
 * @param {ReportsRepository['findPeriodicReports']} findPeriodicReports
 * @returns {Promise<CancelledAccreditationReportsReport>}
 */
export const diagnoseCancelledAccreditationReports = async (
  organisations,
  findPeriodicReports
) => {
  /** @type {CancelledAccreditationRow[]} */
  const rows = []

  for (const organisation of organisations) {
    const cancelled = organisation.accreditations.filter(
      ({ status }) => status === ACCREDITATION_STATUS.CANCELLED
    )
    for (const accreditation of cancelled) {
      const registrations = organisation.registrations.filter(
        ({ accreditationId }) => accreditationId === accreditation.id
      )
      const periodicReports = await Promise.all(
        registrations.map(({ id }) =>
          findPeriodicReports({
            organisationId: organisation.id,
            registrationId: id
          })
        )
      )

      rows.push({
        organisationId: organisation.id,
        orgId: organisation.orgId,
        testOrganisation: TEST_ORGANISATION_IDS.has(organisation.orgId),
        accreditationId: accreditation.id,
        accreditationNumber: accreditation.accreditationNumber ?? null,
        material: accreditation.material,
        validFrom: accreditation.validFrom ?? null,
        validTo: accreditation.validTo ?? null,
        cancelledAt: cancelledAt(accreditation),
        linkedRegistrations: registrations.length,
        reports: periodicReports
          .flat()
          .flatMap(reportRowsOf)
          .sort(byYearCadencePeriodSubmission)
      })
    }
  }

  return {
    rows,
    summary: {
      scannedOrganisations: organisations.length,
      scannedAccreditations: organisations.reduce(
        (count, { accreditations }) => count + accreditations.length,
        0
      ),
      cancelledAccreditations: rows.length,
      reports: rows.reduce((count, row) => count + row.reports.length, 0)
    }
  }
}
