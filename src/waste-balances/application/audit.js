import { safeAudit } from '#root/auditing/helpers.js'

/**
 * Emit the back-office system-log entry and the CDP audit event for a waste
 * balance update. Both write paths — the embedded-array path in
 * `repository/helpers.js` and the ledger-append path in
 * `application/update-via-ledger.js` — share this helper so they produce
 * identical audit shapes (ADR 0031's transparency requirement).
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
  const event = {
    category: 'waste-reporting',
    subCategory: 'waste-balance',
    action: 'update'
  }

  safeAudit({ event, user }, () => ({
    accreditationId,
    amount,
    availableAmount,
    transactionCount: newTransactions.length
  }))

  if (systemLogsRepository) {
    await systemLogsRepository.insert({
      createdAt: new Date(),
      createdBy: user,
      event,
      context: {
        accreditationId,
        amount,
        availableAmount,
        newTransactions
      }
    })
  }
}
