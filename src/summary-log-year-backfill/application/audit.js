import {
  isPayloadSmallEnoughToAudit,
  safeAudit,
  SYSTEM_USER
} from '#auditing/helpers.js'
import { SUMMARY_LOG_SUB_CATEGORY } from '#auditing/summary-logs.js'

/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */

export const YEAR_BACKFILL_ACTION = 'year-backfill-migration'

/**
 * Audits one summary log's year backfill. Records only the changed fields:
 * a summary log can carry every load, so the full document is far too big.
 *
 * @param {SystemLogsRepository} systemLogsRepository
 * @param {{
 *   summaryLogId: string,
 *   organisationId?: string,
 *   registrationId?: string,
 *   previous: { year: number | null | undefined, version: number },
 *   next: { year: number | null | undefined, version: number }
 * }} context
 */
export const auditSummaryLogYearBackfill = async (
  systemLogsRepository,
  context
) => {
  const payload = {
    event: {
      category: 'waste-reporting',
      subCategory: SUMMARY_LOG_SUB_CATEGORY,
      action: YEAR_BACKFILL_ACTION
    },
    context,
    user: SYSTEM_USER
  }

  if (isPayloadSmallEnoughToAudit(payload)) {
    safeAudit(payload)
  }

  await systemLogsRepository.insert({
    createdAt: new Date(),
    createdBy: SYSTEM_USER,
    event: payload.event,
    context
  })
}
