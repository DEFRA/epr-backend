import { logger } from '#common/helpers/logging/logger.js'
import { reconcileStalePrnProjections } from '#packaging-recycling-notes/application/reconcile-stale-prn-projections.js'
import { createDriftQuery } from '#packaging-recycling-notes/repository/drift-query.mongodb.js'
import {
  createPackagingRecyclingNotesRepository,
  COLLECTION_NAME as PACKAGING_RECYCLING_NOTES_COLLECTION_NAME
} from '#packaging-recycling-notes/repository/mongodb.js'
import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import { createMongoLedgerRepository } from '#waste-balances/repository/ledger-mongodb.js'

import { config } from '../config.js'

/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { DriftReport } from '#packaging-recycling-notes/application/reconcile-stale-prn-projections.js' */

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
 * `findDrifting` detects the ids behind their ledger in one indexed query; each
 * is then re-read point-wise off the raw collection and, on repair, written back
 * through the repository's version CAS. Catch-up events come from the
 * waste-balance service over the shared ledger.
 *
 * @param {StartedServer} server
 */
const buildDependencies = async (server) => {
  const prnFactory = await createPackagingRecyclingNotesRepository(
    server.db,
    []
  )
  const ledgerFactory = await createMongoLedgerRepository(server.db)

  return {
    findDrifting: createDriftQuery(server.db),
    prnCollection: server.db.collection(
      PACKAGING_RECYCLING_NOTES_COLLECTION_NAME
    ),
    prnRepository: prnFactory(logger),
    service: createWasteBalanceService(ledgerFactory())
  }
}

/** @param {StartedServer} server */
const runReconcile = async (server) => {
  // Flag off (the default) is diagnostic only; on lets it write the fold back.
  const isDryRun = !config.get('featureFlags.reconcileStalePrnProjections')
  const deps = await buildDependencies(server)

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
  } = await reconcileStalePrnProjections(deps, { isDryRun })

  for (const report of reports) {
    logger.info({ message: formatReport(report) })
  }

  for (const failure of failures) {
    logger.error({
      message: `Reconcile failed for PRN ${failure.prnId}: ${failure.error}`
    })
  }

  const mode = isDryRun ? 'dry-run' : 'repair'
  logger.info({
    message: `Reconcile stale PRN projections (${mode}): total=${total} drifting=${drifting} repaired=${repaired} folded=${folded} stamped=${stamped} stillDrifting=${stillDrifting} failed=${failed}`
  })
}

/**
 * Startup sweep for PRN projections whose stored status lags their ledger — the
 * drift a dropped write-back leaves, which the admin list and download read
 * paths never fold away (ADR-0047). Off by default it only reports; the
 * `reconcileStalePrnProjections` flag lets it repair.
 *
 * Findings log at info, not warn: they are for a human to confirm and info
 * keeps them off the OpenSearch alerts. Runs under a cross-instance lock so one
 * pod per deploy sweeps.
 *
 * @param {StartedServer} server
 */
export const runReconcileStalePrnProjections = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
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
    logger.error({
      err: error,
      message: 'Failed to run reconcile stale PRN projections'
    })
  }
}
