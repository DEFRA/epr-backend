import { safeAudit, SYSTEM_USER } from '#auditing/helpers.js'

/** @import { PrnNumbers } from '#packaging-recycling-notes/repository/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */

export const NUMBERS_BACKFILL_ACTION = 'numbers-backfill-migration'

/**
 * Audits the numbers the backfill added to one PRN.
 *
 * @param {SystemLogsRepository} systemLogsRepository
 * @param {{
 *   prnId: string,
 *   organisationId: string,
 *   registrationId: string,
 *   next: PrnNumbers
 * }} context
 */
export const auditPrnNumbersBackfill = async (
  systemLogsRepository,
  context
) => {
  const payload = {
    event: {
      category: 'waste-reporting',
      subCategory: 'packaging-recycling-notes',
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
