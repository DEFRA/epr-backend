import { currentUtcYear } from '#common/helpers/dates/year.js'
import { logger } from '#common/helpers/logging/logger.js'
import { diagnoseValidityOutsideYear } from '#organisation-years-diagnostic/application/diagnose-validity-outside-year.js'

/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { AccreditationOutsideYearRow, DateProblem, DateProblemCounts, RegistrationOutsideYearRow, ValidityOutsideYearSummary } from '#organisation-years-diagnostic/application/diagnose-validity-outside-year.js' */

const LOCK_NAME = 'organisation-years-diagnostic'

/**
 * @param {string | null | undefined} date
 * @param {DateProblem | undefined} problem
 */
const formatDate = (date, problem) =>
  `${date || 'none'}(${problem ?? 'in-year'})`

/** @param {DateProblemCounts} counts */
const formatCounts = (counts) =>
  Object.entries(counts)
    .map(([problem, count]) => `${problem}:${count}`)
    .join(',')

/** @param {RegistrationOutsideYearRow} row */
const formatRegistrationLine = (row) =>
  [
    'Registration validity outside year:',
    `organisationNumber=${row.organisationNumber}`,
    `testOrganisation=${row.testOrganisation}`,
    `registrationId=${row.registrationId}`,
    `registrationNumber=${row.registrationNumber ?? 'none'}`,
    `status=${row.status}`,
    `validFrom=${formatDate(row.validFrom, row.validFromProblem)}`
  ].join(' ')

/** @param {AccreditationOutsideYearRow} row */
const formatAccreditationLine = (row) =>
  [
    'Accreditation validity outside year:',
    `organisationNumber=${row.organisationNumber}`,
    `testOrganisation=${row.testOrganisation}`,
    `accreditationId=${row.accreditationId}`,
    `accreditationNumber=${row.accreditationNumber ?? 'none'}`,
    `status=${row.status}`,
    `validFrom=${formatDate(row.validFrom, row.validFromProblem)}`,
    `validTo=${formatDate(row.validTo, row.validToProblem)}`
  ].join(' ')

/** @param {ValidityOutsideYearSummary} summary */
const formatSummaryLine = (summary) =>
  [
    'Validity outside year diagnostic:',
    `year=${summary.year}`,
    `scannedRegistrations=${summary.scannedRegistrations}`,
    `registrationsOutsideYear=${summary.registrationsOutsideYear}`,
    `registrationValidFrom=${formatCounts(summary.registrationValidFrom)}`,
    `scannedAccreditations=${summary.scannedAccreditations}`,
    `accreditationsOutsideYear=${summary.accreditationsOutsideYear}`,
    `accreditationValidFrom=${formatCounts(summary.accreditationValidFrom)}`,
    `accreditationValidTo=${formatCounts(summary.accreditationValidTo)}`,
    `rowsInTestOrganisations=${summary.rowsInTestOrganisations}`
  ].join(' ')

/** @param {StartedServer} server */
const runDiagnostic = async (server) => {
  const { registrations, accreditations, summary } =
    diagnoseValidityOutsideYear(
      await server.app.organisationAdministrationRepository.findAll(),
      currentUtcYear()
    )

  for (const row of registrations) {
    logger.info({ message: formatRegistrationLine(row) })
  }
  for (const row of accreditations) {
    logger.info({ message: formatAccreditationLine(row) })
  }

  logger.info({ message: formatSummaryLine(summary) })
}

/**
 * Read-only startup diagnostic for PAE-2300: lists every registration and
 * accreditation whose validity dates are empty or fall outside the current
 * year. Removed once the result is known.
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
