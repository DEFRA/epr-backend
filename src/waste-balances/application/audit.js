import { safeAudit } from '#root/auditing/helpers.js'

/**
 * Emit the back-office system-log entry and the CDP audit event for a waste
 * balance update. The audit event goes through `safeAudit`, which trims the
 * payload internally if it exceeds the safe-audit size limit.
 *
 * @param {Object} params
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [params.systemLogsRepository]
 * @param {string} params.accreditationId
 * @param {number} params.amount
 * @param {number} params.availableAmount
 * @param {Array<Object>} params.newTransactions
 * @param {import('#domain/summary-logs/worker/port.js').SubmitUser} params.user
 */
export const recordWasteBalanceUpdateAudit = async ({
  systemLogsRepository,
  accreditationId,
  amount,
  availableAmount,
  newTransactions,
  user
}) => {
  const payload = {
    event: {
      category: 'waste-reporting',
      subCategory: 'waste-balance',
      action: 'update'
    },
    context: {
      accreditationId,
      amount,
      availableAmount,
      newTransactions
    },
    user
  }

  safeAudit(payload)

  if (systemLogsRepository) {
    await systemLogsRepository.insert({
      createdAt: new Date(),
      createdBy: { ...user, role: null },
      event: payload.event,
      context: payload.context
    })
  }
}
