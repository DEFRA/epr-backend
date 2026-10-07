import { logger } from '#common/helpers/logging/logger.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { diagnoseFutureStatusDates } from '#future-status-date-diagnostic/application/diagnose-future-status-dates.js'

/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { FutureStatusDateRow } from '#future-status-date-diagnostic/application/diagnose-future-status-dates.js' */

const LOCK_NAME = 'future-status-date-diagnostic'

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

/** @param {StartedServer} server */
const runDiagnostic = async (server) => {
  const organisationsRepository = (
    await createOrganisationsRepository(server.db)
  )()

  const { rows, summary } = diagnoseFutureStatusDates(
    await organisationsRepository.findAll(),
    new Date()
  )

  for (const row of rows) {
    logger.info({ message: formatEntryLine(row) })
  }

  logger.info({
    message: `Future status date diagnostic: scannedOrganisations=${summary.scannedOrganisations} scannedEntries=${summary.scannedEntries} futureDatedEntries=${summary.futureDatedEntries}`
  })
}

/**
 * Read-only startup diagnostic: counts status history entries dated in the
 * future. Removed once the counts are known.
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
