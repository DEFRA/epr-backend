import { logger } from '#common/helpers/logging/logger.js'
import { diagnoseNaturalKeyIndexes } from '#natural-key-index-diagnostic/application/diagnose-natural-key-indexes.js'

/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { SharedReportNumbers } from '#natural-key-index-diagnostic/application/diagnose-natural-key-indexes.js' */

const LOCK_NAME = 'natural-key-index-diagnostic'

/** @param {SharedReportNumbers} shared */
const formatSharedLine = ({
  organisationNumber,
  registrationNumber,
  idPairs
}) =>
  [
    'Report numbers shared by more than one id pair:',
    `organisationNumber=${organisationNumber ?? 'missing'}`,
    `registrationNumber=${registrationNumber ?? 'missing'}`,
    `idPairs=${idPairs
      .map(
        ({ organisationId, registrationId }) =>
          `${organisationId}/${registrationId}`
      )
      .join(',')}`
  ].join(' ')

/** @param {StartedServer} server */
const runDiagnostic = async (server) => {
  const diagnosis = await diagnoseNaturalKeyIndexes(server.db)

  for (const shared of diagnosis.sharedReportNumbers) {
    logger.info({ message: formatSharedLine(shared) })
  }

  logger.info({
    message: [
      'Natural key index diagnostic:',
      `summaryLogs=${diagnosis.summaryLogs}`,
      `submittingSummaryLogsWithoutNumbers=${diagnosis.submittingSummaryLogsWithoutNumbers}`,
      `validatedSummaryLogsWithoutNumbers=${diagnosis.validatedSummaryLogsWithoutNumbers}`,
      `submittingLockClashes=${diagnosis.submittingLockClashes}`,
      `reports=${diagnosis.reports}`,
      `reportsWithoutNumbers=${diagnosis.reportsWithoutNumbers}`,
      `sharedReportNumbers=${diagnosis.sharedReportNumbers.length}`,
      `prns=${diagnosis.prns}`,
      `prnsWithoutNumbers=${diagnosis.prnsWithoutNumbers}`,
      `ledgerEvents=${diagnosis.ledgerEvents}`,
      `ledgerEventsWithoutNumbers=${diagnosis.ledgerEventsWithoutNumbers}`,
      `ledgerSlotClashes=${diagnosis.ledgerSlotClashes}`
    ].join(' ')
  })
}

/**
 * Read-only startup diagnostic: says whether the indexes moving onto the
 * numbers (PAE-2207) can be built from the data each environment holds.
 * Removed once those indexes are in.
 *
 * @param {StartedServer} server
 */
export const runNaturalKeyIndexDiagnostic = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping natural key index diagnostic'
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
      message: 'Failed to run natural key index diagnostic'
    })
  }
}
