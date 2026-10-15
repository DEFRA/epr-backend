import { reevaluateResubmissionFlags } from '#application/summary-logs/reevaluate-resubmission-flags.js'
import { logger } from '#common/helpers/logging/logger.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { createOverseasSitesRepository } from '#overseas-sites/repository/mongodb.js'
import { createReportsRepository } from '#reports/repository/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { createMongoLedgerRepository } from '#waste-balances/repository/ledger-mongodb.js'
import { createMongoSummaryLogRowStatesRepository } from '#waste-records/repository/mongodb.js'
import { config } from '#root/config.js'

/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { FlagOutcome } from '#application/summary-logs/reevaluate-resubmission-flags.js' */

const LOCK_NAME = 'resubmission-flags-dry-run'

// The sweep never signs a download, but the repository is built with a client.
const PRE_SIGNED_URL_EXPIRY_SECONDS = 60

/**
 * Field paths only: values can identify suppliers and destinations.
 *
 * @param {FlagOutcome} outcome
 */
const formatOutcome = (outcome) => {
  const { year, cadence, period } = outcome.period
  return [
    `Resubmission flag ${outcome.verdict}:`,
    `organisationId=${outcome.organisationId}`,
    `registrationNumber=${outcome.registrationNumber ?? 'none'}`,
    `accreditationNumber=${outcome.accreditationNumber ?? 'none'}`,
    `reportId=${outcome.reportId}`,
    `submissionNumber=${outcome.submissionNumber}`,
    `year=${year}`,
    `cadence=${cadence}`,
    `period=${period}`,
    `flaggedAt=${outcome.flaggedAt}`,
    `flaggedBy=${outcome.flaggedBy}`,
    `reason=${'reason' in outcome ? outcome.reason : 'none'}`,
    `changedFields=${'changedFields' in outcome ? outcome.changedFields.join(',') : 'none'}`,
    `detail=${'detail' in outcome ? JSON.stringify(outcome.detail) : 'none'}`
  ].join(' ')
}

/**
 * @param {FlagOutcome[]} outcomes
 * @param {string} reason
 */
const keptFor = (outcomes, reason) =>
  outcomes.filter((outcome) => 'reason' in outcome && outcome.reason === reason)
    .length

/**
 * @param {{ outcomes: FlagOutcome[], failures: unknown[] }} result
 */
const formatSummary = ({ outcomes, failures }) =>
  [
    'Resubmission flags dry run:',
    `flagged=${outcomes.length + failures.length}`,
    `wouldClear=${outcomes.filter(({ verdict }) => verdict === 'would-clear').length}`,
    `keptOperatorRequested=${keptFor(outcomes, 'operator-requested')}`,
    `keptResubmissionInProgress=${keptFor(outcomes, 'resubmission-in-progress')}`,
    `keptFiguresChanged=${keptFor(outcomes, 'figures-changed')}`,
    `keptCannotCompare=${keptFor(outcomes, 'cannot-compare')}`,
    `failed=${failures.length}`
  ].join(' ')

/** @param {StartedServer} server */
const buildDependencies = async (server) => ({
  reportsRepository: (await createReportsRepository(server.db))(),
  organisationsRepository: (await createOrganisationsRepository(server.db))(),
  summaryLogsRepository: (
    await createSummaryLogsRepository(server.db, {
      s3Client: createS3Client({
        region: config.get('awsRegion'),
        endpoint: config.get('s3Endpoint'),
        forcePathStyle: config.get('isDevelopment')
      }),
      preSignedUrlExpiry: PRE_SIGNED_URL_EXPIRY_SECONDS
    })
  )(logger),
  ledgerRepository: (await createMongoLedgerRepository(server.db))(),
  summaryLogRowStatesRepository: (
    await createMongoSummaryLogRowStatesRepository(server.db)
  )(),
  overseasSitesRepository: (await createOverseasSitesRepository(server.db))()
})

/** @param {StartedServer} server */
const runSweep = async (server) => {
  const result = await reevaluateResubmissionFlags(
    await buildDependencies(server)
  )

  for (const outcome of result.outcomes) {
    logger.info({ message: formatOutcome(outcome) })
  }
  for (const failure of result.failures) {
    logger.error({
      message: `Failed to re-evaluate resubmission flag on report ${failure.reportId}: ${failure.error}`
    })
  }
  logger.info({ message: formatSummary(result) })
}

/**
 * Read-only startup sweep producing the review list of closed-period
 * resubmission flags. Findings log at info to stay off the OpenSearch alerts.
 *
 * @param {StartedServer} server
 */
export const runResubmissionFlagsDryRun = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping resubmission flags dry run'
      })
      return
    }
    try {
      await runSweep(server)
    } finally {
      await lock.free()
    }
  } catch (error) {
    logger.error({
      err: error,
      message: 'Failed to run resubmission flags dry run'
    })
  }
}
