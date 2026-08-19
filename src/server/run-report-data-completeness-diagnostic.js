import { logger } from '#common/helpers/logging/logger.js'
import {
  findReportDataCompletenessFindings,
  formatFinding,
  summariseByTemplate,
  formatTemplateBreakdown,
  summariseByMaterial,
  formatMaterialBreakdown,
  formatFieldBreakdown,
  formatTotals,
  formatUnresolved
} from '#reports/monitoring/report-data-completeness-diagnostic.js'

/** @import { StartedServer } from '#common/hapi-types.js' */

const LOCK_NAME = 'report-data-complete-diagnostic'

/**
 * Scans every live summary log and logs which would fail the report-completeness
 * rules: one line per violating summary log, per-template and per-material
 * rollups, then the estate-wide totals. Read-only.
 *
 * @param {StartedServer} server - Hapi server instance
 */
const runDiagnostic = async (server) => {
  const { scanned, findings, unresolved, missingFieldCounts } =
    await findReportDataCompletenessFindings({
      ledgerRepository: server.app.ledgerRepository,
      summaryLogRowStatesRepository: server.app.summaryLogRowStatesRepository,
      organisationsRepository: server.app.organisationsRepository
    })

  for (const finding of findings) {
    logger.info({ message: formatFinding(finding) })
  }
  logger.info({
    message: formatTemplateBreakdown(summariseByTemplate(findings))
  })
  logger.info({
    message: formatMaterialBreakdown(summariseByMaterial(findings))
  })
  logger.info({ message: formatFieldBreakdown(missingFieldCounts) })
  logger.info({ message: formatTotals({ scanned, findings }) })

  for (const item of unresolved) {
    logger.warn({ message: formatUnresolved(item) })
  }
}

/**
 * Startup diagnostic (defra-4ry0) that surfaces how many live summary logs would
 * be blocked by the report-data completeness gate, without changing any
 * user-facing behaviour. Reuses the gate's own rules engine so the diagnostic
 * can never drift from what the gate enforces. Runs under a cross-instance lock
 * so a single pod per deploy executes and logs it.
 *
 * Gated by the reportDataCompleteDiagnostic feature flag, which is separate from
 * the blocking gate's flag and off by default: with it off this returns before
 * touching the locker or any repository.
 *
 * @param {StartedServer} server - Hapi server instance
 * @param {import('convict').Config<Record<string, any>>} config
 */
export const runReportDataCompletenessDiagnostic = async (server, config) => {
  if (!config.get('featureFlags.reportDataCompleteDiagnostic')) {
    return
  }

  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message:
          'Unable to obtain lock, skipping report-data completeness diagnostic'
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
      message: 'Failed to run report-data completeness diagnostic'
    })
  }
}
