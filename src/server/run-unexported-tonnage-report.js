import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import { logger } from '#common/helpers/logging/logger.js'
import {
  FINDING_KIND,
  findUnexportedTonnageReports,
  formatUnexportedTonnageFinding,
  largestUnexportedTonnageDeltas,
  summariseOverExport,
  summariseUnexportedTonnageByMaterial,
  summariseUnexportedTonnageByMonth,
  summariseUnexportedTonnageByStatus,
  summariseUnexportedTonnageFindings
} from '#reports/monitoring/unexported-tonnage.js'

/**
 * @import { StartedServer } from '#common/hapi-types.js'
 * @import { MaterialBreakdown, OverExportRecord, UnexportedTonnageFinding } from '#reports/monitoring/unexported-tonnage.js'
 */

const LOCK_NAME = 'unexported-tonnage-report'
const LARGEST_DELTAS_REPORTED = 5

/**
 * One action per kind, so a run's mismatches can be read apart from the reports
 * it could not recompute without parsing message text.
 */
const ACTION_BY_FINDING_KIND = Object.freeze({
  [FINDING_KIND.MISMATCH]: LOGGING_EVENT_ACTIONS.UNEXPORTED_TONNAGE_MISMATCH,
  [FINDING_KIND.SOURCE_MISSING]:
    LOGGING_EVENT_ACTIONS.UNEXPORTED_TONNAGE_SOURCE_MISSING,
  [FINDING_KIND.RECOMPUTE_FAILED]:
    LOGGING_EVENT_ACTIONS.UNEXPORTED_TONNAGE_RECOMPUTE_FAILED,
  [FINDING_KIND.LOOKUP_FAILED]:
    LOGGING_EVENT_ACTIONS.UNEXPORTED_TONNAGE_LOOKUP_FAILED
})

/**
 * CDP indexes only an allowlisted set of ECS fields, so a figure logged as a
 * property is dropped at ingest and cannot be aggregated in OpenSearch. The
 * figures therefore stay in the message and every breakdown is rolled up before
 * it is logged; `event.action` is what makes a line findable without a regex,
 * and `event.reference` ties it to the report it is about.
 *
 * @param {string} action
 * @param {string} message
 * @param {string} [reference]
 */
const log = (action, message, reference) =>
  logger.info({
    message,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action,
      ...(reference ? { reference } : {})
    }
  })

/**
 * The compact per-material segment shared by the month lines, so a month's total
 * reads down to the stream it came from on the same line.
 *
 * @param {MaterialBreakdown[]} byMaterial
 * @returns {string}
 */
const materialSegment = (byMaterial) =>
  byMaterial
    .map(
      ({ material, reports, delta }) =>
        `${material} ${reports} report(s) delta ${delta}`
    )
    .join(', ')

/**
 * @param {UnexportedTonnageFinding[]} findings
 */
const logBreakdowns = (findings) => {
  summariseUnexportedTonnageByMonth(findings).forEach(
    ({ month, reports, delta, understated, overstated, byMaterial }) =>
      log(
        LOGGING_EVENT_ACTIONS.UNEXPORTED_TONNAGE_BY_MONTH,
        `Unexported tonnage by month: ${month} - ${reports} report(s), ` +
          `delta ${delta}, understated ${understated}, overstated ${overstated}; ` +
          `by material: ${materialSegment(byMaterial)}`
      )
  )

  summariseUnexportedTonnageByMaterial(findings).forEach(
    ({ material, reports, delta, understated, overstated }) =>
      log(
        LOGGING_EVENT_ACTIONS.UNEXPORTED_TONNAGE_BY_MATERIAL,
        `Unexported tonnage by material: ${material} - ${reports} report(s), ` +
          `delta ${delta}, understated ${understated}, overstated ${overstated}`
      )
  )

  const byStatus = Object.entries(summariseUnexportedTonnageByStatus(findings))
    .map(([status, count]) => `${status} ${count}`)
    .join(', ')
  log(
    LOGGING_EVENT_ACTIONS.UNEXPORTED_TONNAGE_BY_STATUS,
    `Unexported tonnage by status: ${byStatus}`
  )

  const largest = largestUnexportedTonnageDeltas(
    findings,
    LARGEST_DELTAS_REPORTED
  )
  if (largest.length > 0) {
    log(
      LOGGING_EVENT_ACTIONS.UNEXPORTED_TONNAGE_LARGEST_DELTAS,
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
 * Sizes the over-exports validation lets through: rows that exported more than
 * they received, how many summary logs mask such a row behind loads that net it
 * out, and the negative tonnage split by material. Logged whatever the count so
 * a clean estate is stated rather than left silent.
 *
 * @param {OverExportRecord[]} overExportRecords
 */
const logOverExport = (overExportRecords) => {
  const {
    rowsNegative,
    summaryLogsWithNegativeRow,
    summaryLogsNetNegative,
    summaryLogsMasking,
    affectedExporters,
    magnitudeByMaterial
  } = summariseOverExport(overExportRecords)

  const byMaterial =
    Object.entries(magnitudeByMaterial)
      .map(([material, tonnage]) => `${material} ${tonnage}`)
      .join(', ') || 'none'

  log(
    LOGGING_EVENT_ACTIONS.UNEXPORTED_TONNAGE_OVER_EXPORT,
    `Over-export sizing: ${rowsNegative} rows over-exported (T>S) in ` +
      `${summaryLogsWithNegativeRow} summary logs, of which ` +
      `${summaryLogsNetNegative} net negative and ${summaryLogsMasking} masked; ` +
      `affected exporters ${affectedExporters}; ` +
      `magnitude by material: ${byMaterial}`
  )
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
    lookupFailed,
    affectedExporters,
    affectedOrganisations,
    unresolvedExporters,
    rowsInPeriod,
    rowsUnexported,
    rowsOverExported,
    rowsMissingReceived,
    rowsMiscounted,
    totalDelta,
    totalUnderstated,
    totalOverstated
  } = summariseUnexportedTonnageFindings(findings)

  log(
    LOGGING_EVENT_ACTIONS.UNEXPORTED_TONNAGE_SUMMARY,
    `Unexported tonnage: scanned ${scanned}, mismatches ${mismatches}, ` +
      `source-missing ${sourceMissing}, recompute-failed ${recomputeFailed}, ` +
      `lookup-failed ${lookupFailed}, ` +
      `affected exporters ${affectedExporters} across ` +
      `${affectedOrganisations} organisations, ` +
      `unresolved exporters ${unresolvedExporters}, ` +
      `rows ${rowsInPeriod} in period / ${rowsMiscounted} miscounted / ` +
      `${rowsUnexported} unexported / ` +
      `${rowsOverExported} over-exported / ` +
      `${rowsMissingReceived} missing received, total delta ${totalDelta} ` +
      `(understated ${totalUnderstated}, overstated ${totalOverstated})`
  )
}

/**
 * Named so the integration test can assert each one resolves against a real
 * booted server, which a unit test's double cannot.
 *
 * @param {StartedServer} server
 */
export const unexportedTonnageDependencies = (server) => ({
  reportsRepository: server.app.reportsRepository,
  organisationsRepository: server.app.organisationsRepository,
  summaryLogRowStatesRepository: server.app.summaryLogRowStatesRepository
})

/**
 * Recomputes every accredited-exporter monthly report's "packaging waste
 * received but not exported" figure under the PAE-1783 rule (per load, column S
 * minus column T) and logs the reports whose stored value disagrees. Read-only,
 * safe under live traffic.
 *
 * @param {StartedServer} server
 */
const runReport = async (server) => {
  const { scanned, findings, overExportRecords } =
    await findUnexportedTonnageReports(unexportedTonnageDependencies(server))

  findings.forEach((finding) =>
    log(
      ACTION_BY_FINDING_KIND[finding.kind],
      formatUnexportedTonnageFinding(finding),
      finding.reportId
    )
  )
  logBreakdowns(findings)
  logOverExport(overExportRecords)
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
 * @param {StartedServer} server
 */
export const runUnexportedTonnageReport = async (server) => {
  if (!server.featureFlags.isUnexportedTonnageReportEnabled()) {
    return
  }

  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      log(
        LOGGING_EVENT_ACTIONS.LOCK_ACQUISITION_FAILED,
        'Unable to obtain lock, skipping unexported tonnage report'
      )
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
