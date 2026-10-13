import { clearUnwarrantedResubmissionFlags } from '#application/summary-logs/clear-unwarranted-resubmission-flags.js'
import { describeChange } from '#application/summary-logs/periods-requiring-resubmission.js'
import { logger } from '#common/helpers/logging/logger.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { createOverseasSitesRepository } from '#overseas-sites/repository/mongodb.js'
import { createReportsRepository } from '#reports/repository/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'
import { createMongoLedgerRepository } from '#waste-balances/repository/ledger-mongodb.js'
import { createMongoSummaryLogRowStatesRepository } from '#waste-records/repository/mongodb.js'

import { config } from '../config.js'

/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { FlagOutcome } from '#application/summary-logs/clear-unwarranted-resubmission-flags.js' */

const LOCK_NAME = 'clear-unwarranted-resubmission-flags'

// The sweep never signs a download, but the repository is built with a client.
const PRE_SIGNED_URL_EXPIRY_SECONDS = 60

/** @param {FlagOutcome} outcome */
const formatOutcome = (outcome) =>
  [
    `Resubmission flag ${outcome.action}:`,
    `organisationId=${outcome.organisationId}`,
    `registrationId=${outcome.registrationId}`,
    `reportId=${outcome.reportId}`,
    `submissionNumber=${outcome.submissionNumber}`,
    `year=${outcome.period.year}`,
    `cadence=${outcome.period.cadence}`,
    `period=${outcome.period.period}`,
    `flaggedAt=${outcome.closedPeriodRestated.uploadedAt}`,
    `flaggedBy=${outcome.closedPeriodRestated.summaryLogId}`,
    `source=${outcome.comparison.baseline.sourceSummaryLogId ?? 'none'}`,
    `head=${outcome.headSummaryLogId ?? 'none'}`,
    `verdict=${describeChange(outcome.comparison)}`
  ].join(' ')

/**
 * @param {FlagOutcome[]} outcomes
 * @param {FlagOutcome['action']} action
 */
const countOf = (outcomes, action) =>
  outcomes.filter((outcome) => outcome.action === action).length

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
  overseasSitesRepository: (await createOverseasSitesRepository(server.db))(),
  systemLogsRepository: (await createSystemLogsRepository(server.db))(logger)
})

/** @param {StartedServer} server */
const runSweep = async (server) => {
  const isDryRun = !config.get('featureFlags.clearUnwarrantedResubmissionFlags')

  const { outcomes, failures } = await clearUnwarrantedResubmissionFlags(
    await buildDependencies(server),
    { isDryRun }
  )

  for (const outcome of outcomes) {
    logger.info({ message: formatOutcome(outcome) })
  }

  for (const failure of failures) {
    logger.error({
      message: `Failed to re-evaluate resubmission flag on report ${failure.reportId}: ${failure.error}`
    })
  }

  const mode = isDryRun ? 'dry-run' : 'repair'
  logger.info({
    message: `Clear unwarranted resubmission flags (${mode}): flagged=${outcomes.length + failures.length} cleared=${countOf(outcomes, 'cleared')} wouldClear=${countOf(outcomes, 'would-clear')} kept=${countOf(outcomes, 'kept')} skipped=${countOf(outcomes, 'skipped')} failed=${failures.length}`
  })
}

/**
 * Startup sweep for reports flagged for resubmission before the figure gate,
 * when any upload restating a closed period flagged it. Off by default it only
 * reports; the `clearUnwarrantedResubmissionFlags` flag lets it clear the flags
 * whose reported figures are unchanged.
 *
 * Findings log at info, not warn: they are for a human to review and info
 * keeps them off the OpenSearch alerts. Runs under a cross-instance lock so one
 * pod per deploy sweeps.
 *
 * @param {StartedServer} server
 */
export const runClearUnwarrantedResubmissionFlags = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message:
          'Unable to obtain lock, skipping clear unwarranted resubmission flags'
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
      message: 'Failed to run clear unwarranted resubmission flags'
    })
  }
}
