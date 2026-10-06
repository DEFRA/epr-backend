import { logger } from '#common/helpers/logging/logger.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { diagnoseApplicationContacts } from '#application-contact-diagnostic/application/diagnose-application-contacts.js'

/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { MissingApplicationContactRow } from '#application-contact-diagnostic/application/diagnose-application-contacts.js' */

const LOCK_NAME = 'application-contact-diagnostic'

/** @param {MissingApplicationContactRow} row */
const formatRegistrationLine = (row) =>
  [
    'Registration missing application contact:',
    `organisationId=${row.organisationId}`,
    `orgId=${row.orgId}`,
    `testOrganisation=${row.testOrganisation}`,
    `schemaVersion=${row.schemaVersion}`,
    `registrationId=${row.registrationId}`,
    `registrationNumber=${row.registrationNumber ?? 'none'}`,
    `status=${row.status}`
  ].join(' ')

/** @param {StartedServer} server */
const runDiagnostic = async (server) => {
  const organisationsRepository = (
    await createOrganisationsRepository(server.db)
  )()

  const { rows, summary } = diagnoseApplicationContacts(
    await organisationsRepository.findAll()
  )

  for (const row of rows) {
    logger.info({ message: formatRegistrationLine(row) })
  }

  logger.info({
    message: `Application contact diagnostic: scannedOrganisations=${summary.scannedOrganisations} scannedRegistrations=${summary.scannedRegistrations} missingApplicationContact=${summary.missingApplicationContact} missingWithRegistrationNumber=${summary.missingWithRegistrationNumber}`
  })
}

/**
 * Read-only startup diagnostic: counts registrations without
 * `applicationContactDetails`. Removed once the counts are known.
 *
 * @param {StartedServer} server
 */
export const runApplicationContactDiagnostic = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message:
          'Unable to obtain lock, skipping application contact diagnostic'
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
      message: 'Failed to run application contact diagnostic'
    })
  }
}
