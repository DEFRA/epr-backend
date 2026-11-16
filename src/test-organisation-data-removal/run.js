import { logger } from '#common/helpers/logging/logger.js'
import { TEST_ORGANISATION_NUMBERS } from '#common/helpers/parse-test-organisations.js'

import {
  describeCounts,
  describeLedger,
  removeTestOrganisationData
} from './application/removal.js'
import { createTestOrganisationRecords } from './mongodb.js'
import { config } from '../config.js'

/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { SourceIds } from './mongodb.js' */
/** @import { RemovedUnnumberedSummaryLogs } from './application/removal.js' */

const LOCK_NAME = 'test-organisation-data-removal'

/** @param {SourceIds} sources */
const describeSources = ({ summaryLogIds, prnIds }) =>
  `summaryLogIds=${summaryLogIds.join(',')} prnIds=${prnIds.join(',')}`

/** @param {RemovedUnnumberedSummaryLogs} unnumbered */
const describeUnnumbered = ({
  organisationNumber,
  organisationId,
  summaryLogIds,
  removed
}) =>
  `organisationNumber=${organisationNumber} organisationId=${organisationId}: summaryLogs=${removed} summaryLogIds=${summaryLogIds.join(',')}`

/** @param {StartedServer} server */
const runRemoval = async (server) => {
  const isDryRun = !config.get('featureFlags.testOrganisationWholeDataRemoval')

  const { removed, unnumbered, skipped, failed, auditFailed } =
    await removeTestOrganisationData(
      {
        testOrganisationNumbers: TEST_ORGANISATION_NUMBERS,
        records: createTestOrganisationRecords(server.db),
        systemLogsRepository: server.app.systemLogsRepository,
        logger
      },
      { isDryRun }
    )

  const mode = isDryRun ? 'dry-run' : 'removal'
  const details = [
    ...removed.map(
      ({ ledger, counts, sources }) =>
        `${describeLedger(ledger)}: ${describeCounts(counts)} ${describeSources(sources)}`
    ),
    ...unnumbered.map(describeUnnumbered)
  ]
    .map((detail) => `; ${detail}`)
    .join('')
  logger.info({
    message: `Test organisation data removal (${mode}): ledgers=${removed.length} unnumbered=${unnumbered.length} skipped=${skipped} failed=${failed} auditFailed=${auditFailed}${details}`
  })
}

/**
 * Startup removal of every record test organisations hold, keeping the
 * organisations themselves. Flag off (the default) only reports what it would
 * remove; on removes it, auditing each ledger. Both modes log one summary
 * line, and an error for each failure. It is removed once it has run.
 *
 * @param {StartedServer} server
 */
export const runTestOrganisationDataRemoval = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message:
          'Unable to obtain lock, skipping test organisation data removal'
      })
      return
    }
    try {
      await runRemoval(server)
    } finally {
      await lock.free()
    }
  } catch (error) {
    logger.error({
      err: error,
      message: 'Failed to run test organisation data removal'
    })
  }
}
