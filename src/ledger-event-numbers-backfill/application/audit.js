import { safeAudit, SYSTEM_USER } from '#auditing/helpers.js'

/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */
/** @import { LedgerEventNumbers } from '#waste-balances/repository/ledger-schema.js' */

export const NUMBERS_BACKFILL_ACTION = 'numbers-backfill-migration'

/**
 * Audits the numbers added to one waste balance ledger's events, with how
 * many it changed. One audit per ledger, not per event.
 *
 * @param {SystemLogsRepository} systemLogsRepository
 * @param {{
 *   organisationId: string,
 *   registrationId: string,
 *   accreditationId: string | null,
 *   events: number,
 *   next: LedgerEventNumbers
 * }} context
 */
export const auditLedgerEventNumbersBackfill = async (
  systemLogsRepository,
  context
) => {
  const payload = {
    event: {
      category: 'waste-reporting',
      subCategory: 'waste-balance',
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
