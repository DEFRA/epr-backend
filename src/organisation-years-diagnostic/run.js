import { latestOpenYear } from '#common/helpers/dates/latest-open-year.js'
import { logger } from '#common/helpers/logging/logger.js'
import { diagnoseOrganisationYears } from '#organisation-years-diagnostic/application/diagnose-organisation-years.js'

/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { OrganisationYearsRow, OrganisationYearsSummary } from '#organisation-years-diagnostic/application/diagnose-organisation-years.js' */

const LOCK_NAME = 'organisation-years-diagnostic'

/** @param {OrganisationYearsRow} row */
const formatRowLine = (row) =>
  [
    'Organisation years:',
    `organisationNumber=${row.organisationNumber}`,
    `testOrganisation=${row.testOrganisation}`,
    `years=${row.years.join(',')}`,
    `registrations=${row.registrations
      .map(
        (registration) =>
          `${registration.registrationId}|${registration.status}|${registration.firstApprovedAt}|${registration.years.join(',')}`
      )
      .join(';')}`
  ].join(' ')

/** @param {OrganisationYearsSummary} summary */
const formatSummaryLine = (summary) =>
  [
    'Organisation years diagnostic:',
    `openYear=${summary.openYear}`,
    `scannedOrganisations=${summary.scannedOrganisations}`,
    `organisationsWithOtherYears=${summary.organisationsWithOtherYears}`,
    `otherYearsInTestOrganisations=${summary.otherYearsInTestOrganisations}`,
    `organisationsWithNoYear=${summary.organisationsWithNoYear}`,
    `organisationsByYear=${
      Object.entries(summary.organisationsByYear)
        .map(([year, count]) => `${year}:${count}`)
        .join(',') || 'none'
    }`
  ].join(' ')

/** @param {StartedServer} server */
const runDiagnostic = async (server) => {
  const { rows, summary } = diagnoseOrganisationYears(
    await server.app.organisationReadRepository.findAll(),
    latestOpenYear()
  )

  for (const row of rows) {
    logger.info({ message: formatRowLine(row) })
  }

  logger.info({ message: formatSummaryLine(summary) })
}

/**
 * Read-only startup diagnostic for PAE-2300: confirms no organisation is
 * served a year other than the open one before the frontend's
 * navigate-across-years flag is removed. Removed once the result is known.
 *
 * @param {StartedServer} server
 */
export const runOrganisationYearsDiagnostic = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping organisation years diagnostic'
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
      message: 'Failed to run organisation years diagnostic'
    })
  }
}
