import { safeAudit, SYSTEM_USER } from '#auditing/helpers.js'

/** @import { ReportNumbers } from '#reports/repository/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */

export const NUMBERS_BACKFILL_ACTION = 'numbers-backfill-migration'

/**
 * Audits the numbers the backfill added to one report.
 *
 * @param {SystemLogsRepository} systemLogsRepository
 * @param {{
 *   reportId: string,
 *   organisationId: string,
 *   registrationId: string,
 *   next: ReportNumbers
 * }} context
 */
export const auditReportNumbersBackfill = async (
  systemLogsRepository,
  context
) => {
  const payload = {
    event: {
      category: 'waste-reporting',
      subCategory: 'reports',
      action: NUMBERS_BACKFILL_ACTION
    },
    context,
    user: SYSTEM_USER
  }

  safeAudit(payload)

  await systemLogsRepository.insert({
    createdAt: new Date(),
    createdBy: SYSTEM_USER,
    event: payload.event,
    context
  })
}
