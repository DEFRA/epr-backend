import { safeAudit, SYSTEM_USER } from '#auditing/helpers.js'

/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */
/** @import { RowStateNumbers } from '#waste-records/repository/schema.js' */

export const NUMBERS_BACKFILL_ACTION = 'numbers-backfill-migration'

/**
 * Audits the numbers added to one ledger's row states, with how many it
 * changed. One audit per ledger, not per row state: a ledger holds every row
 * of every summary log submitted to it.
 *
 * @param {SystemLogsRepository} systemLogsRepository
 * @param {{
 *   organisationId: string,
 *   registrationId: string,
 *   accreditationId: string | null,
 *   rowStates: number,
 *   next: RowStateNumbers
 * }} context
 */
export const auditRowStateNumbersBackfill = async (
  systemLogsRepository,
  context
) => {
  const payload = {
    event: {
      category: 'waste-reporting',
      subCategory: 'summary-log-row-states',
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
