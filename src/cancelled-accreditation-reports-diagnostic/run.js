import { logger } from '#common/helpers/logging/logger.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createReportsRepository } from '#reports/repository/mongodb.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { diagnoseCancelledAccreditationReports } from '#cancelled-accreditation-reports-diagnostic/application/diagnose-cancelled-accreditation-reports.js'

/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { Cadence } from '#reports/domain/cadence.js' */
/** @import { CancelledAccreditationReportRow, CancelledAccreditationRow } from '#cancelled-accreditation-reports-diagnostic/application/diagnose-cancelled-accreditation-reports.js' */

const LOCK_NAME = 'cancelled-accreditation-reports-diagnostic'

/**
 * @param {CancelledAccreditationRow} row
 * @param {Cadence} cadence
 */
const countOf = (row, cadence) =>
  row.reports.filter((report) => report.cadence === cadence).length

/** @param {CancelledAccreditationRow} row */
const formatAccreditationLine = (row) =>
  [
    'Cancelled accreditation:',
    `organisationId=${row.organisationId}`,
    `orgId=${row.orgId}`,
    `testOrganisation=${row.testOrganisation}`,
    `accreditationId=${row.accreditationId}`,
    `accreditationNumber=${row.accreditationNumber ?? 'none'}`,
    `material=${row.material}`,
    `cancelledAt=${row.cancelledAt ?? 'none'}`,
    `linkedRegistrations=${row.linkedRegistrations}`,
    `reports=${row.reports.length}`,
    `monthlyReports=${countOf(row, CADENCE.monthly)}`,
    `quarterlyReports=${countOf(row, CADENCE.quarterly)}`
  ].join(' ')

/**
 * @param {CancelledAccreditationRow} row
 * @param {CancelledAccreditationReportRow} report
 */
const formatReportLine = (row, report) =>
  [
    'Cancelled accreditation report:',
    `organisationId=${row.organisationId}`,
    `accreditationId=${row.accreditationId}`,
    `registrationId=${report.registrationId}`,
    `cadence=${report.cadence}`,
    `year=${report.year}`,
    `period=${report.period}`,
    `submissionNumber=${report.submissionNumber}`,
    `status=${report.status}`
  ].join(' ')

/** @param {StartedServer} server */
const runDiagnostic = async (server) => {
  const organisationsRepository = (
    await createOrganisationsRepository(server.db)
  )()
  const reportsRepository = (await createReportsRepository(server.db))()

  const { rows, summary } = await diagnoseCancelledAccreditationReports(
    await organisationsRepository.findAll(),
    reportsRepository.findPeriodicReports
  )

  for (const row of rows) {
    logger.info({ message: formatAccreditationLine(row) })
    for (const report of row.reports) {
      logger.info({ message: formatReportLine(row, report) })
    }
  }

  logger.info({
    message: `Cancelled accreditation reports diagnostic: scannedOrganisations=${summary.scannedOrganisations} scannedAccreditations=${summary.scannedAccreditations} cancelledAccreditations=${summary.cancelledAccreditations} reports=${summary.reports}`
  })
}

/**
 * Read-only startup diagnostic: lists every report each cancelled
 * accreditation's registration holds, so it can be seen which monthly reports
 * were filed before the cancellation turned its calendar quarterly. It writes
 * nothing.
 *
 * It runs on every startup, like the other read-only sweeps, and is removed
 * once the counts are known. The Mongo lock keeps a single pod doing the work;
 * any error is caught so it can never crash boot.
 *
 * @param {StartedServer} server - Hapi server instance
 */
export const runCancelledAccreditationReportsDiagnostic = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message:
          'Unable to obtain lock, skipping cancelled accreditation reports diagnostic'
      })
      return
    }
    try {
      await runDiagnostic(server)
    } finally {
      await lock.free()
    }
  } catch (error) {
    logger.error({
      err: error,
      message: 'Failed to run cancelled accreditation reports diagnostic'
    })
  }
}
