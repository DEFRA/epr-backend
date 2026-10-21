import { safeAudit, SYSTEM_USER } from '#auditing/helpers.js'
import { SUMMARY_LOG_SUB_CATEGORY } from '#auditing/summary-logs.js'

/** @import { SummaryLogNumbers } from '#domain/summary-logs/numbers.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */

export const NUMBERS_BACKFILL_ACTION = 'numbers-backfill-migration'

/**
 * Audits the numbers added to one summary log. Records only the changed
 * fields: a summary log can carry every load, so the full document is far
 * too big.
 *
 * @param {SystemLogsRepository} systemLogsRepository
 * @param {{
 *   summaryLogId: string,
 *   organisationId?: string,
 *   registrationId?: string,
 *   accreditationId?: string | null,
 *   previous: { version: number },
 *   next: SummaryLogNumbers & { version: number }
 * }} context
 */
export const auditSummaryLogNumbersBackfill = async (
  systemLogsRepository,
  context
) => {
  const payload = {
    event: {
      category: 'waste-reporting',
      subCategory: SUMMARY_LOG_SUB_CATEGORY,
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
