import { latestOpenYear } from '#common/helpers/dates/latest-open-year.js'
import { currentUtcYear } from '#common/helpers/dates/year.js'
import { logger } from '#common/helpers/logging/logger.js'
import { diagnoseOrganisationYears } from '#organisation-years-diagnostic/application/diagnose-organisation-years.js'
import { diagnoseValidity } from '#organisation-years-diagnostic/application/diagnose-validity.js'

/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { OrganisationYearsRow, OrganisationYearsSummary } from '#organisation-years-diagnostic/application/diagnose-organisation-years.js' */
/** @import { AccreditationValidityRow, RegistrationValidityRow, ValiditySummary } from '#organisation-years-diagnostic/application/diagnose-validity.js' */

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

/** @param {RegistrationValidityRow} row */
const formatRegistrationValidityLine = (row) =>
  [
    'Registration validity:',
    `organisationNumber=${row.organisationNumber}`,
    `testOrganisation=${row.testOrganisation}`,
    `registrationId=${row.registrationId}`,
    `registrationNumber=${row.registrationNumber ?? 'none'}`,
    `status=${row.status}`,
    `validFrom=${row.validFrom}`
  ].join(' ')

/** @param {AccreditationValidityRow} row */
const formatAccreditationValidityLine = (row) =>
  [
    'Accreditation validity:',
    `organisationNumber=${row.organisationNumber}`,
    `testOrganisation=${row.testOrganisation}`,
    `accreditationId=${row.accreditationId}`,
    `accreditationNumber=${row.accreditationNumber ?? 'none'}`,
    `status=${row.status}`,
    `validFrom=${row.validFrom ?? 'none'}`,
    `validTo=${row.validTo ?? 'none'}`
  ].join(' ')

/** @param {ValiditySummary} summary */
const formatValiditySummaryLine = (summary) =>
  [
    'Validity diagnostic:',
    `year=${summary.year}`,
    `scannedRegistrations=${summary.scannedRegistrations}`,
    `registrationsStartingBefore=${summary.registrationsStartingBefore}`,
    `scannedAccreditations=${summary.scannedAccreditations}`,
    `accreditationsStartingBefore=${summary.accreditationsStartingBefore}`,
    `accreditationsEndingAfter=${summary.accreditationsEndingAfter}`,
    `accreditationsEndingOnFirstJanuary=${summary.accreditationsEndingOnFirstJanuary}`,
    `unparseableDates=${summary.unparseableDates}`,
    `rowsInTestOrganisations=${summary.rowsInTestOrganisations}`
  ].join(' ')

/** @param {StartedServer} server */
const runValidityDiagnostic = async (server) => {
  const { registrations, accreditations, summary } = diagnoseValidity(
    await server.app.organisationAdministrationRepository.findAll(),
    currentUtcYear()
  )

  for (const row of registrations) {
    logger.info({ message: formatRegistrationValidityLine(row) })
  }
  for (const row of accreditations) {
    logger.info({ message: formatAccreditationValidityLine(row) })
  }

  logger.info({ message: formatValiditySummaryLine(summary) })
}

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
 * served a year other than the open one, and no registration or accreditation
 * is valid outside the current year, before the frontend's
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
      await runValidityDiagnostic(server)
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
