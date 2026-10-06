import { logger } from '#common/helpers/logging/logger.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { diagnoseDuplicateNumbers } from '#duplicate-number-diagnostic/application/diagnose-duplicate-numbers.js'

/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { DuplicateNumberRow, NumberHolder } from '#duplicate-number-diagnostic/application/diagnose-duplicate-numbers.js' */

const LOCK_NAME = 'duplicate-number-diagnostic'

/** @param {NumberHolder} holder */
const formatHolder = (holder) =>
  [
    `organisationId=${holder.organisationId}`,
    `orgId=${holder.orgId}`,
    `testOrganisation=${holder.testOrganisation}`,
    `recordId=${holder.recordId}`,
    `status=${holder.status}`
  ].join(' ')

/** @param {DuplicateNumberRow} row */
const formatDuplicateLine = (row) =>
  [
    `Duplicate ${row.recordType} number:`,
    `number=${row.number}`,
    `holders=${row.holders.length}`,
    `organisations=${row.organisations}`,
    row.holders.map((holder) => `[${formatHolder(holder)}]`).join(' ')
  ].join(' ')

/** @param {StartedServer} server */
const runDiagnostic = async (server) => {
  const organisationsRepository = (
    await createOrganisationsRepository(server.db)
  )()

  const { rows, summary } = diagnoseDuplicateNumbers(
    await organisationsRepository.findAll()
  )

  for (const row of rows) {
    logger.info({ message: formatDuplicateLine(row) })
  }

  logger.info({
    message: `Duplicate number diagnostic: scannedOrganisations=${summary.scannedOrganisations} numberedAccreditations=${summary.numberedAccreditations} numberedRegistrations=${summary.numberedRegistrations} duplicateAccreditationNumbers=${summary.duplicateAccreditationNumbers} duplicateRegistrationNumbers=${summary.duplicateRegistrationNumbers}`
  })
}

/**
 * Read-only startup diagnostic: finds accreditation and registration numbers
 * held by more than one record, before anything enforces their uniqueness.
 * Removed once the counts are known.
 *
 * @param {StartedServer} server
 */
export const runDuplicateNumberDiagnostic = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping duplicate number diagnostic'
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
      message: 'Failed to run duplicate number diagnostic'
    })
  }
}
