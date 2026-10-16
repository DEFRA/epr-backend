import { logger } from '#common/helpers/logging/logger.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { diagnoseNaturalKeyFormats } from '#natural-key-format-diagnostic/application/diagnose-natural-key-formats.js'

/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { FormatMismatchRow } from '#natural-key-format-diagnostic/application/diagnose-natural-key-formats.js' */

const LOCK_NAME = 'natural-key-format-diagnostic'

/** @param {FormatMismatchRow} row */
const formatMismatchLine = (row) =>
  [
    'Page URL number format mismatch:',
    `recordType=${row.recordType}`,
    `number=${JSON.stringify(row.number)}`,
    `breaksUrlSegment=${row.breaksUrlSegment}`,
    `organisationId=${row.organisationId}`,
    `orgId=${row.orgId}`,
    `testOrganisation=${row.testOrganisation}`,
    `recordId=${row.recordId}`,
    `status=${row.status}`
  ].join(' ')

/** @param {StartedServer} server */
const runDiagnostic = async (server) => {
  const organisationsRepository = (
    await createOrganisationsRepository(server.db)
  )()

  const { rows, summary } = diagnoseNaturalKeyFormats(
    await organisationsRepository.findAll()
  )

  for (const row of rows) {
    logger.info({ message: formatMismatchLine(row) })
  }

  logger.info({
    message: `Page URL number format diagnostic: scannedOrganisations=${summary.scannedOrganisations} checkedRegistrations=${summary.checkedRegistrations} checkedAccreditations=${summary.checkedAccreditations} mismatchedRegistrationNumbers=${summary.mismatchedRegistrationNumbers} mismatchedAccreditationNumbers=${summary.mismatchedAccreditationNumbers}`
  })
}

/**
 * Read-only startup diagnostic: finds registration and accreditation numbers
 * epr-frontend would not recognise in a page URL (PAE-2041). Removed once the
 * counts are known.
 *
 * @param {StartedServer} server
 */
export const runNaturalKeyFormatDiagnostic = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message:
          'Unable to obtain lock, skipping page URL number format diagnostic'
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
      message: 'Failed to run page URL number format diagnostic'
    })
  }
}
