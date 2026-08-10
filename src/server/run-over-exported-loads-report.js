import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import { logger } from '#common/helpers/logging/logger.js'
import { log, runUnderLock } from './diagnostic-run.js'
import {
  findOverExportedLoads,
  formatOverExportedLoadsFinding,
  largestOverExportedLoads,
  summariseOverExportedLoadsByMaterial,
  summariseOverExportedLoadsByMonth,
  summariseOverExportedLoadsFindings
} from '#reports/monitoring/over-exported-loads.js'

/**
 * @import { StartedServer } from '#common/hapi-types.js'
 * @import {
 *   OverExportedLoadsFinding,
 *   UnreadableReport
 * } from '#reports/monitoring/over-exported-loads.js'
 */

const LOCK_NAME = 'over-exported-loads-report'
const LARGEST_REPORTED = 5

/**
 * @param {OverExportedLoadsFinding[]} findings
 */
const logBreakdowns = (findings) => {
  summariseOverExportedLoadsByMaterial(findings).forEach(
    ({ material, overshoot }) =>
      log(
        LOGGING_EVENT_ACTIONS.OVER_EXPORTED_LOADS_BY_MATERIAL,
        `Over-exported loads by material: ${material} - overshoot ${overshoot}`
      )
  )

  summariseOverExportedLoadsByMonth(findings).forEach(
    ({ month, reports, loads, overshoot }) =>
      log(
        LOGGING_EVENT_ACTIONS.OVER_EXPORTED_LOADS_BY_MONTH,
        `Over-exported loads by month: ${month} - ${reports} report(s), ` +
          `${loads} load(s), overshoot ${overshoot}`
      )
  )

  const largest = largestOverExportedLoads(findings, LARGEST_REPORTED)
  if (largest.length > 0) {
    const listed = largest
      .map(
        ({ reportId, rowId, overshoot }) =>
          `${rowId} (${reportId}) ${overshoot}`
      )
      .join('; ')

    log(
      LOGGING_EVENT_ACTIONS.OVER_EXPORTED_LOADS_LARGEST,
      `Over-exported loads largest: ${listed}`
    )
  }
}

/**
 * @param {UnreadableReport[]} unreadable
 */
const warnUnreadable = (unreadable) =>
  unreadable.forEach(({ reportId, reason }) =>
    logger.warn({
      message: `Over-exported loads: could not read report ${reportId} - ${reason}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.OVER_EXPORTED_LOADS_UNREADABLE,
        reference: reportId
      }
    })
  )

/**
 * @param {number} scanned
 * @param {UnreadableReport[]} unreadable
 * @param {OverExportedLoadsFinding[]} findings
 */
const logSummary = (scanned, unreadable, findings) => {
  const { reports, loads, exporters, organisations, masked, totalOvershoot } =
    summariseOverExportedLoadsFindings(findings)

  log(
    LOGGING_EVENT_ACTIONS.OVER_EXPORTED_LOADS_SUMMARY,
    `Over-exported loads: scanned ${scanned}, reports ${reports}, ` +
      `loads ${loads}, exporters ${exporters} across ` +
      `${organisations} organisations, masked ${masked}, ` +
      `unreadable ${unreadable.length}, total overshoot ${totalOvershoot}`
  )
}

/**
 * @param {StartedServer} server
 */
const runReport = async (server) => {
  const { scanned, unreadable, findings } = await findOverExportedLoads({
    reportsRepository: server.app.reportsRepository,
    organisationsRepository: server.app.organisationsRepository,
    summaryLogRowStatesRepository: server.app.summaryLogRowStatesRepository
  })

  findings.forEach((finding) =>
    log(
      LOGGING_EVENT_ACTIONS.OVER_EXPORTED_LOADS_FINDING,
      formatOverExportedLoadsFinding(finding),
      finding.reportId
    )
  )
  warnUnreadable(unreadable)
  logBreakdowns(findings)
  logSummary(scanned, unreadable, findings)
}

/**
 * Startup diagnostic that sizes the loads reporting more tonnage exported than
 * received: how many there are, by how much, and which reports carry them. The
 * not-exported figure clamps such a load to zero, so the overshoot is discarded
 * and this run is the only place the quantity stays visible.
 *
 * Runs under a cross-instance lock so a single pod per deploy executes it.
 * Read-only. Gated by the over-exported-loads-report feature flag: with it off
 * this returns before touching the locker or any repository.
 *
 * @param {StartedServer} server
 */
export const runOverExportedLoadsReport = async (server) => {
  if (!server.featureFlags.isOverExportedLoadsReportEnabled()) {
    return
  }

  await runUnderLock({
    locker: server.locker,
    lockName: LOCK_NAME,
    label: 'over-exported loads report',
    run: () => runReport(server)
  })
}
