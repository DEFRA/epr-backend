import { logger } from '#common/helpers/logging/logger.js'
import { diagnoseResubmissionFigures } from '#report-resubmission-figures-diagnostic/application/diagnose-resubmission-figures.js'
import { createResubmissionPairsQuery } from '#report-resubmission-figures-diagnostic/repository/resubmission-pairs-query.mongodb.js'

import { config } from '../config.js'

/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { IdenticalResubmissionRow } from '#report-resubmission-figures-diagnostic/application/diagnose-resubmission-figures.js' */

const LOCK_NAME = 'report-resubmission-figures-diagnostic'

/** @param {IdenticalResubmissionRow} r */
const formatIdenticalLine = (r) =>
  [
    'Pointless resubmission:',
    `organisationId=${r.organisationId}`,
    `registrationId=${r.registrationId}`,
    `year=${r.year}`,
    `cadence=${r.cadence}`,
    `period=${r.period}`,
    `fromSubmissionNumber=${r.fromSubmissionNumber}`,
    `toSubmissionNumber=${r.toSubmissionNumber}`
  ].join(' ')

/** @param {StartedServer} server */
const runDiagnostic = async (server) => {
  const query = createResubmissionPairsQuery(server.db)
  const { scanned, groups } = await query()

  const { reports, summary } = diagnoseResubmissionFigures(groups)

  for (const report of reports) {
    logger.info({ message: formatIdenticalLine(report) })
  }

  logger.info({
    message: `Resubmission figures diagnostic: scannedSubmittedReports=${scanned} resubmittedPeriods=${summary.resubmittedPeriods} resubmissionPairs=${summary.resubmissionPairs} autoEnforcedResubmissions=${summary.autoEnforcedResubmissions} identicalResubmissions=${summary.identicalResubmissions} changedResubmissions=${summary.changedResubmissions}`
  })
}

/**
 * Read-only startup diagnostic for PAE-1985: sizes how much resubmission churn
 * is figure-neutral by diffing each closed period's successive submitted
 * reports and counting those whose reported figures are identical to the
 * previous submission (see the application module for the figure definition).
 *
 * Like the stream-transition sweep it gates on its flag BEFORE acquiring the
 * lock: with no dry-run/repair duality, a flag-off pod should do no database
 * work at all. The Mongo lock keeps a single pod doing the work; any error is
 * caught so it can never crash boot.
 *
 * @param {StartedServer} server - Hapi server instance
 */
export const runResubmissionFiguresDiagnostic = async (server) => {
  if (!config.get('featureFlags.resubmissionFiguresDiagnostic')) {
    return
  }

  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message:
          'Unable to obtain lock, skipping resubmission figures diagnostic'
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
      message: 'Failed to run resubmission figures diagnostic'
    })
  }
}
