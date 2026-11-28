import { createDriftQuery } from '#packaging-recycling-notes/repository/drift-query.mongodb.js'
import { reconcileStalePrnProjections } from './reconcile-stale-prn-projections.js'

/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { DriftReport } from './reconcile-stale-prn-projections.js' */

const LOCK_NAME = 'reconcile-stale-prn-projections'

/** @param {DriftReport} report */
const formatReport = (report) =>
  [
    'Stale PRN projection:',
    `prnId=${report.prnId}`,
    `prnNumber=${report.prnNumber}`,
    `currentStatus=${report.currentStatus}`,
    `lastAppliedEventNumber=${report.lastAppliedEventNumber}`,
    `unapplied=${report.unappliedCount}`,
    `minUnappliedNumber=${report.minUnappliedNumber}`,
    `wouldBecomeStatus=${report.wouldBecomeStatus}`
  ].join(' ')

/**
 * `findDrifting` detects the ids behind their ledger in one indexed query; the
 * sweep then re-reads each through the PRN repository and writes it back
 * through the repository's version CAS. Catch-up events come from the
 * server's waste balance service.
 *
 * @param {StartedServer} server
 */
const buildDependencies = (server) => ({
  findDrifting: createDriftQuery(server.db),
  prnRepository: server.app.packagingRecyclingNotesRepository,
  service: server.app.wasteBalanceService
})

/** @param {StartedServer} server */
const runReconcile = async (server) => {
  const deps = buildDependencies(server)

  const {
    total,
    drifting,
    repaired,
    folded,
    stamped,
    stillDrifting,
    failed,
    reports,
    failures
  } = await reconcileStalePrnProjections(deps)

  for (const report of reports) {
    server.logger.info({ message: formatReport(report) })
  }

  for (const failure of failures) {
    server.logger.error({
      message: `Reconcile failed for PRN ${failure.prnId}: ${failure.error}`
    })
  }

  server.logger.info({
    message: `Reconcile stale PRN projections: total=${total} drifting=${drifting} repaired=${repaired} folded=${folded} stamped=${stamped} stillDrifting=${stillDrifting} failed=${failed}`
  })
}

/**
 * Startup sweep for PRN projections whose stored status lags their ledger — the
 * drift a dropped write-back leaves, which the admin list and download read
 * paths never fold away (ADR-0047).
 *
 * Findings log at info, not warn: repaired drift is not an incident, and info
 * keeps it off the OpenSearch alerts. Runs under a cross-instance lock so one
 * pod per deploy sweeps.
 *
 * @param {StartedServer} server
 */
export const runReconcileStalePrnProjections = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      server.logger.info({
        message:
          'Unable to obtain lock, skipping reconcile stale PRN projections'
      })
      return
    }
    try {
      await runReconcile(server)
    } finally {
      await lock.free()
    }
  } catch (error) {
    server.logger.error({
      err: error,
      message: 'Failed to run reconcile stale PRN projections'
    })
  }
}
