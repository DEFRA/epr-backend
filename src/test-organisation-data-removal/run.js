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

const LOCK_NAME = 'test-organisation-data-removal'

/** @param {SourceIds} sources */
const describeSources = ({ summaryLogIds, prnIds }) =>
  `summaryLogIds=${summaryLogIds.join(',')} prnIds=${prnIds.join(',')}`

/** @param {StartedServer} server */
const runRemoval = async (server) => {
  const isDryRun = !config.get('featureFlags.testOrganisationDataRemoval')

  const { removed, undecided, skipped, failed, auditFailed } =
    await removeTestOrganisationData(
      {
        testOrganisationNumbers: TEST_ORGANISATION_NUMBERS,
        records: createTestOrganisationRecords(server.db),
        organisationReadRepository: server.app.organisationReadRepository,
        systemLogsRepository: server.app.systemLogsRepository,
        logger
      },
      { isDryRun }
    )

  const mode = isDryRun ? 'dry-run' : 'removal'
  const byLedger = removed
    .map(
      ({ ledger, counts, sources }) =>
        `; ${describeLedger(ledger)}: ${describeCounts(counts)} ${describeSources(sources)}`
    )
    .join('')
  logger.info({
    message: `Test organisation data removal (${mode}): ledgers=${removed.length} undecided=${undecided} skipped=${skipped} failed=${failed} auditFailed=${auditFailed}${byLedger}`
  })
}

/**
 * Startup removal of test organisations' records stored under numbers the
 * organisation read model does not hold for them. Flag off (the default) only
 * reports what it would remove; on removes it, auditing each ledger. Both
 * modes log one summary line, and an error for each failure. It judges against
 * the read model as it stands at each start, so the flag is meant to be turned
 * off once the removal has run.
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
