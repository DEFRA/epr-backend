import { logger } from '#common/helpers/logging/logger.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { diagnoseFutureStatusDates } from '#future-status-date-diagnostic/application/diagnose-future-status-dates.js'
import { diagnoseApprovedAccreditationYears } from '#future-status-date-diagnostic/application/diagnose-approved-accreditation-years.js'

/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { FutureStatusDateRow } from '#future-status-date-diagnostic/application/diagnose-future-status-dates.js' */
/** @import { AccreditationOutsideYearRow } from '#future-status-date-diagnostic/application/diagnose-approved-accreditation-years.js' */

const LOCK_NAME = 'future-status-date-diagnostic'
const ACCREDITATION_YEAR = 2026

/** @param {FutureStatusDateRow} row */
const formatEntryLine = (row) =>
  [
    'Future-dated status history entry:',
    `organisationId=${row.organisationId}`,
    `orgId=${row.orgId}`,
    `testOrganisation=${row.testOrganisation}`,
    `itemType=${row.itemType}`,
    `itemId=${row.itemId}`,
    `status=${row.status}`,
    `updatedAt=${row.updatedAt}`
  ].join(' ')

/** @param {AccreditationOutsideYearRow} row */
const formatAccreditationLine = (row) =>
  [
    'Approved accreditation outside year:',
    `organisationId=${row.organisationId}`,
    `orgId=${row.orgId}`,
    `testOrganisation=${row.testOrganisation}`,
    `accreditationId=${row.accreditationId}`,
    `accreditationNumber=${row.accreditationNumber}`,
    `validFrom=${row.validFrom}`,
    `validTo=${row.validTo}`
  ].join(' ')

/** @param {StartedServer} server */
const runDiagnostic = async (server) => {
  const organisationsRepository = (
    await createOrganisationsRepository(server.db)
  )()

  const organisations = await organisationsRepository.findAll()
  const { rows, summary } = diagnoseFutureStatusDates(organisations, new Date())

  for (const row of rows) {
    logger.info({ message: formatEntryLine(row) })
  }

  logger.info({
    message: `Future status date diagnostic: scannedOrganisations=${summary.scannedOrganisations} scannedEntries=${summary.scannedEntries} futureDatedEntries=${summary.futureDatedEntries}`
  })

  const years = diagnoseApprovedAccreditationYears(
    organisations,
    ACCREDITATION_YEAR
  )

  for (const row of years.rows) {
    logger.info({ message: formatAccreditationLine(row) })
  }

  logger.info({
    message: `Approved accreditation year diagnostic: year=${ACCREDITATION_YEAR} scannedApproved=${years.summary.scannedApproved} outsideYear=${years.summary.outsideYear}`
  })
}

/**
 * Read-only startup diagnostic: counts status history entries dated in the
 * future, and approved accreditations not valid from and to 2026. Removed once
 * the counts are known.
 *
 * @param {StartedServer} server
 */
export const runFutureStatusDateDiagnostic = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping future status date diagnostic'
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
      message: 'Failed to run future status date diagnostic'
    })
  }
}
