import { safeAudit, SYSTEM_USER } from '#auditing/helpers.js'
import { SUMMARY_LOG_SUB_CATEGORY } from '#auditing/summary-logs.js'

/** @import { SummaryLogScope } from '../mongodb.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */
/** @import { AccreditationNumber, OrganisationNumber, RegistrationNumber } from '#domain/organisations/numbers.js' */

export const SCOPE_BACKFILL_ACTION = 'scope-backfill-migration'

/**
 * Audits the scope added to one summary log. Records only the changed
 * fields: a summary log can carry every load, so the full document is far
 * too big.
 *
 * @param {SystemLogsRepository} systemLogsRepository
 * @param {{
 *   summaryLogId: string,
 *   organisationId?: string,
 *   registrationId?: string,
 *   organisationNumber: OrganisationNumber | undefined,
 *   registrationNumber: RegistrationNumber | undefined,
 *   accreditationNumber: AccreditationNumber | null | undefined,
 *   previous: { version: number },
 *   next: SummaryLogScope & { version: number }
 * }} context
 */
export const auditSummaryLogScopeBackfill = async (
  systemLogsRepository,
  context
) => {
  const payload = {
    event: {
      category: 'waste-reporting',
      subCategory: SUMMARY_LOG_SUB_CATEGORY,
      action: SCOPE_BACKFILL_ACTION
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
