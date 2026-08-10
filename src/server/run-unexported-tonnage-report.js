import { LOGGING_EVENT_ACTIONS } from '#common/enums/event.js'
import { log, runUnderLock } from './diagnostic-run.js'
import {
  FINDING_KIND,
  findUnexportedTonnageReports,
  formatUnexportedTonnageFinding,
  largestUnexportedTonnageDeltas,
  summariseUnexportedTonnageByMonth,
  summariseUnexportedTonnageByStatus,
  summariseUnexportedTonnageFindings
} from '#reports/monitoring/unexported-tonnage.js'

/**
 * @import { StartedServer } from '#common/hapi-types.js'
 * @import { UnexportedTonnageFinding } from '#reports/monitoring/unexported-tonnage.js'
 */

const LOCK_NAME = 'unexported-tonnage-report'
const LARGEST_DELTAS_REPORTED = 5

/**
 * One action per kind, so a run's mismatches can be read apart from the reports
 * it could not recompute without parsing message text.
 */
const ACTION_BY_FINDING_KIND = Object.freeze({
  [FINDING_KIND.MISMATCH]: LOGGING_EVENT_ACTIONS.UNEXPORTED_TONNAGE_MISMATCH,
  [FINDING_KIND.FIGURE_MISSING]:
    LOGGING_EVENT_ACTIONS.UNEXPORTED_TONNAGE_FIGURE_MISSING,
  [FINDING_KIND.SOURCE_MISSING]:
    LOGGING_EVENT_ACTIONS.UNEXPORTED_TONNAGE_SOURCE_MISSING,
  [FINDING_KIND.RECOMPUTE_FAILED]:
    LOGGING_EVENT_ACTIONS.UNEXPORTED_TONNAGE_RECOMPUTE_FAILED,
  [FINDING_KIND.LOOKUP_FAILED]:
    LOGGING_EVENT_ACTIONS.UNEXPORTED_TONNAGE_LOOKUP_FAILED
})

/**
 * @param {UnexportedTonnageFinding[]} findings
 */
const logBreakdowns = (findings) => {
  summariseUnexportedTonnageByMonth(findings).forEach(
    ({ month, reports, delta, understated, overstated }) =>
      log(
        LOGGING_EVENT_ACTIONS.UNEXPORTED_TONNAGE_BY_MONTH,
        `Unexported tonnage by month: ${month} - ${reports} report(s), ` +
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
 * @param {number} scanned
 * @param {UnexportedTonnageFinding[]} findings
 */
const logSummary = (scanned, findings) => {
  const {
    mismatches,
    figureMissing,
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
      `figure-missing ${figureMissing}, ` +
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
 * Recomputes every exporter monthly report's "packaging waste received but not
 * exported" figure under the corrected rule (per load, column S minus column T)
 * and logs the reports whose stored value disagrees. Read-only, safe under live
 * traffic.
 *
 * @param {StartedServer} server
 */
const runReport = async (server) => {
  const { scanned, findings } = await findUnexportedTonnageReports(
    unexportedTonnageDependencies(server)
  )

  findings.forEach((finding) =>
    log(
      ACTION_BY_FINDING_KIND[finding.kind],
      formatUnexportedTonnageFinding(finding),
      finding.reportId
    )
  )
  logBreakdowns(findings)
  logSummary(scanned, findings)
}

/**
 * Startup diagnostic that sizes the miscalculation: how many stored reports
 * the fix would change, by how much, and how many cannot be recomputed
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

  await runUnderLock({
    locker: server.locker,
    lockName: LOCK_NAME,
    label: 'unexported tonnage report',
    run: () => runReport(server)
  })
}
