import { logger } from '#common/helpers/logging/logger.js'
import {
  findUnexportedTonnageReports,
  formatUnexportedTonnageFinding,
  largestUnexportedTonnageDeltas,
  summariseUnexportedTonnageByMonth,
  summariseUnexportedTonnageByStatus,
  summariseUnexportedTonnageFindings
} from '#reports/monitoring/unexported-tonnage.js'

/**
 * @import { UnexportedTonnageFinding } from '#reports/monitoring/unexported-tonnage.js'
 */

const LOCK_NAME = 'unexported-tonnage-report'
const LARGEST_DELTAS_REPORTED = 5

const log = (message) => logger.info({ message })

/**
 * CDP indexes only an allowlisted set of ECS fields, so a figure logged as a
 * property is dropped at ingest and cannot be aggregated in OpenSearch. Every
 * breakdown is therefore rolled up here and emitted as a finished line.
 *
 * @param {UnexportedTonnageFinding[]} findings
 */
const logBreakdowns = (findings) => {
  summariseUnexportedTonnageByMonth(findings).forEach(
    ({ month, reports, delta, understated, overstated }) =>
      log(
        `Unexported tonnage by month: ${month} - ${reports} report(s), ` +
          `delta ${delta}, understated ${understated}, overstated ${overstated}`
      )
  )

  const byStatus = Object.entries(summariseUnexportedTonnageByStatus(findings))
    .map(([status, count]) => `${status} ${count}`)
    .join(', ')
  log(`Unexported tonnage by status: ${byStatus}`)

  const largest = largestUnexportedTonnageDeltas(
    findings,
    LARGEST_DELTAS_REPORTED
  )
  if (largest.length > 0) {
    log(
      'Unexported tonnage largest deltas: ' +
        largest
          .map(
            ({ reportId, month, delta }) => `${reportId} (${month}) ${delta}`
          )
          .join('; ')
    )
  }
}

/**
 * @param {number} scanned
 * @param {UnexportedTonnageFinding[]} findings
 */
const logSummary = (scanned, findings) => {
  const {
    mismatches,
    sourceMissing,
    recomputeFailed,
    affectedExporters,
    affectedOrganisations,
    unresolvedExporters,
    rowsInPeriod,
    rowsUnexported,
    rowsOverExported,
    totalDelta,
    totalUnderstated,
    totalOverstated
  } = summariseUnexportedTonnageFindings(findings)

  log(
    `Unexported tonnage: scanned ${scanned}, mismatches ${mismatches}, ` +
      `source-missing ${sourceMissing}, recompute-failed ${recomputeFailed}, ` +
      `affected exporters ${affectedExporters} across ` +
      `${affectedOrganisations} organisations, ` +
      `unresolved exporters ${unresolvedExporters}, ` +
      `rows ${rowsInPeriod} in period / ${rowsUnexported} unexported / ` +
      `${rowsOverExported} over-exported, total delta ${totalDelta} ` +
      `(understated ${totalUnderstated}, overstated ${totalOverstated})`
  )
}

/**
 * Recomputes every accredited-exporter monthly report's "packaging waste
 * received but not exported" figure under the PAE-1783 rule (per load, column S
 * minus column T) and logs the reports whose stored value disagrees. Read-only,
 * safe under live traffic.
 *
 * @param {Object} server - Hapi server instance
 */
const runReport = async (server) => {
  const { scanned, findings } = await findUnexportedTonnageReports({
    reportsRepository: server.app.reportsRepository,
    organisationsRepository: server.app.organisationsRepository,
    summaryLogRowStateRepository: server.app.summaryLogRowStateRepository
  })

  findings.forEach((finding) => log(formatUnexportedTonnageFinding(finding)))
  logBreakdowns(findings)
  logSummary(scanned, findings)
}

/**
 * Startup diagnostic that sizes the PAE-1783 miscalculation: how many stored
 * reports the fix would change, by how much, and how many cannot be recomputed
 * because their source rows no longer resolve. Runs under a cross-instance lock
 * so a single pod per deploy executes and logs it. Read-only.
 *
 * Gated by the unexported-tonnage-report feature flag: with it off this
 * returns before touching the locker or any repository.
 *
 * @param {Object} server - Hapi server instance
 */
export const runUnexportedTonnageReport = async (server) => {
  if (!server.featureFlags.isUnexportedTonnageReportEnabled()) {
    return
  }

  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping unexported tonnage report'
      })
      return
    }
    try {
      await runReport(server)
    } finally {
      await lock.free()
    }
  } catch (error) {
    logger.error({
      err: error,
      message: 'Failed to run unexported tonnage report'
    })
  }
}
