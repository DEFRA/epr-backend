import { logger } from '#common/helpers/logging/logger.js'
import { createMongoLedgerRepository } from '#waste-balances/repository/ledger-mongodb.js'
import { createMongoSummaryLogRowStatesRepository } from '#waste-records/repository/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { buildDecemberLoadsReport } from '#december-loads-diagnostic/application/diagnose-december-loads.js'

/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { DecemberLoadRow } from '#december-loads-diagnostic/application/diagnose-december-loads.js' */

const LOCK_NAME = 'december-loads-diagnostic'

/** @param {DecemberLoadRow} r */
const formatCandidateLine = (r) =>
  [
    'December balance mismatch:',
    `organisationId=${r.organisationId}`,
    `organisationReference=${r.organisationReference}`,
    `accreditationId=${r.accreditationId}`,
    `accreditationNumber=${r.accreditationNumber}`,
    `processingType=${r.processingType}`,
    `decemberMonth=${r.decemberKey}`,
    `summaryLogDecemberTonnage=${r.summaryLogDecemberTonnage}`,
    `ledgerDecemberBalance=${r.ledgerDecemberBalance ?? 'absent'}`
  ].join(' ')

/** @param {StartedServer} server */
const runDiagnostic = async (server) => {
  const ledgerRepository = (await createMongoLedgerRepository(server.db))()
  const summaryLogRowStatesRepository = (
    await createMongoSummaryLogRowStatesRepository(server.db)
  )()
  const organisationsRepository = (
    await createOrganisationsRepository(server.db)
  )()

  const { reports, summary } = await buildDecemberLoadsReport({
    ledgerRepository,
    summaryLogRowStatesRepository,
    organisationsRepository,
    logger
  })

  for (const report of reports) {
    logger.info({ message: formatCandidateLine(report) })
  }

  logger.info({
    message: `December loads diagnostic: scannedAccreditations=${summary.scannedAccreditations} accreditationsWithDecemberBalance=${summary.accreditationsWithDecemberBalance} mismatchedAccreditations=${summary.mismatchedAccreditations}`
  })
}

/**
 * Read-only startup diagnostic for PAE-1920: checks whether each accreditation's
 * recorded ledger December portion agrees with the December tonnage its current
 * summary-log rows compute (exporter and reprocessor-input; reprocessor-output
 * never accrues December). A disagreement — including a ledger that records no
 * December portion where tonnage exists — flags an accreditation whose December
 * portion needs a backfill. It reports them so they can be checked; it writes
 * nothing.
 *
 * A one-off sweep, run unconditionally on startup like the other read-only
 * sweeps, then removed once the check has run. The Mongo lock keeps a single pod
 * doing the work; any error is caught so it can never crash boot.
 *
 * @param {StartedServer} server - Hapi server instance
 */
export const runDecemberLoadsDiagnostic = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping December loads diagnostic'
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
      message: 'Failed to run December loads diagnostic'
    })
  }
}
